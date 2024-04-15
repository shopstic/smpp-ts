import { SmppKnownCommandStatus } from "../../src/command_status.ts";
import { DeliverSm, DeliverSmResp, SmppCommandId, SmppNpi, SmppTon, SubmitSm, SubmitSmResp } from "../../src/common.ts";
import { SmppDeliveryReceipt } from "../../src/delivery_receipt.ts";
import { AsyncQueue, promiseTimeout, WindowCorrelationError } from "../../src/deps/utils.ts";
import { createSmppPeer, PduTx, PduWithContext } from "../../src/peer.ts";
import { renderSmppPduAsTable } from "../../src/prettify.ts";
import { Logger } from "../deps.ts";

export type DrWithResponder = {
  dr: DeliverSm;
  receipt: SmppDeliveryReceipt;
  respond: (drResp: DeliverSmResp) => Promise<void>;
};

export type MoWithResponder = {
  mo: DeliverSm;
  respond: (drResp: DeliverSmResp) => Promise<void>;
};

export type DeliverSmWithResponder = {
  pdu: DeliverSm;
  respond: (drResp: DeliverSmResp) => Promise<void>;
};

export type BenchEsmeController<MtCtx> = {
  submitSmQueue: AsyncQueue<PduWithContext<SubmitSm, MtCtx>>;
  submitSmRespQueue: AsyncQueue<PduTx<PduWithContext<SubmitSm, MtCtx>, SubmitSmResp>>;
  deliverSmQueue: AsyncQueue<DeliverSmWithResponder>;
};

export async function runBenchEsme<MtCtx>(
  {
    systemId,
    password,
    smscHostname,
    smscPort,
    logger,
    signal,
    smscConnectTimeoutMs = 5000,
    windowSize = 10,
    mtPerSecondRateLimit,
  }: {
    systemId: string;
    password: string;
    smscHostname: string;
    smscPort: number;
    logger: Logger;
    signal: AbortSignal;
    smscConnectTimeoutMs?: number;
    windowSize?: number;
    mtPerSecondRateLimit?: number;
  },
) {
  logger.info?.("connecting to host:", smscHostname, "port:", smscPort);
  const connection = await promiseTimeout(
    smscConnectTimeoutMs,
    () => Deno.connect({ hostname: smscHostname, port: smscPort }),
    () => new Error(`Failed to connect to SMSC within ${smscConnectTimeoutMs}ms`),
  );
  logger.info?.("connected to host:", smscHostname, "port:", smscPort);

  const submitSmQueue = new AsyncQueue<PduWithContext<SubmitSm, MtCtx>>();
  const submitSmRespQueue = new AsyncQueue<PduTx<PduWithContext<SubmitSm, MtCtx>, SubmitSmResp>>();
  const deliverSmQueue = new AsyncQueue<DeliverSmWithResponder>();
  const controller: BenchEsmeController<MtCtx> = { submitSmQueue, submitSmRespQueue, deliverSmQueue };

  const esmePromise = (async () => {
    try {
      const smppPeer = createSmppPeer<MtCtx>({
        windowSize,
        connectionWriter: connection.writable.getWriter(),
        connectionReader: connection.readable.getReader({ mode: "byob" }),
        responseTimeoutMs: 5000,
        enquireLinkIntervalMs: 10_000,
        signal,
        tapIncomingPdu(pdu) {
          logger.debug?.(renderSmppPduAsTable(pdu));
        },
        tapOutgoingPdu(pdu) {
          logger.debug?.(renderSmppPduAsTable(pdu));
        },
      });

      const settledResults = await smppPeer.runEsme({
        bindRequest: {
          commandId: SmppCommandId.BindTransceiver,
          commandStatus: SmppKnownCommandStatus.ESME_ROK,
          systemId,
          password,
          addressRange: "",
          systemType: "",
          addrNpi: SmppNpi.E164,
          addrTon: SmppTon.International,
          interfaceVersion: 0x34,
          sequenceNumber: 0,
        },
        handle: () =>
          Promise.resolve({
            messageRequestQueue: mtPerSecondRateLimit
              ? submitSmQueue.throttle(mtPerSecondRateLimit, 1000)
              : submitSmQueue,
            async handleRemoteMessageResponse(request: PduWithContext<SubmitSm, MtCtx>, response: SubmitSmResp) {
              await submitSmRespQueue.enqueue({ request, response });
            },
            async handleRemoteMessageRequest(request: DeliverSm) {
              const { resolve, promise } = Promise.withResolvers<DeliverSmResp>();

              await deliverSmQueue.enqueue({
                pdu: request,
                respond: async (response: DeliverSmResp) => {
                  resolve(response);
                  await promise;
                  return;
                },
              });

              return await promise;
            },
          }),
      });

      for (const [key, result] of Object.entries(settledResults)) {
        if (result.status === "rejected" && result.reason.name !== "AbortError") {
          const reason = (result.reason instanceof WindowCorrelationError)
            ? `WindowCorrelationError(uncorrelated=${result.reason.uncorrelated.length}): ${result.reason.message}`
            : result.reason;
          logger.error?.("client failed component:", key, reason);
        }
      }
    } catch (e) {
      logger.error?.("client failed", e);
    } finally {
      logger.info?.("closing connection");
      try {
        connection.close();
      } catch (_) {
        // Ignore
      }
      logger.info?.("connection closed");
    }
  })().finally(() => {
    submitSmQueue.complete();
    submitSmRespQueue.complete();
    deliverSmQueue.complete();
  });

  return {
    controller,
    esmePromise,
  };
}
