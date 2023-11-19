import { smppCharsetEncode } from "../../src/charset.ts";
import { SmppKnownCommandStatus } from "../../src/command_status.ts";
import {
  BindResponse,
  DeliverSm,
  getBindResponseCommandId,
  SmppCommandId,
  SmppKnownDataCoding,
  SmppSupportedCharset,
  SubmitSmResp,
} from "../../src/common.ts";
import { deferred } from "../../src/deps/std.ts";
import { assert } from "../../src/deps/std_test.ts";
import { AsyncQueue, promiseTimeout, WindowCorrelationError } from "../../src/deps/utils.ts";
import { SmppEsmClass, SmppMessageType, SmppMessagingMode } from "../../src/esm_class.ts";
import { SmppMessageState } from "../../src/message_state.ts";
import { createSmppPeer, PduWithContext } from "../../src/peer.ts";
import { renderSmppPduAsTable } from "../../src/prettify.ts";
import { SmppRegisteredDelivery } from "../../src/registered_delivery.ts";
import {
  SmppKnownTlvTag,
  smppTlvEncodeMessageState,
  smppTlvEncodeNetworkErrorCode,
  smppTlvEncodeReceiptedMessageId,
  SmppTlvs,
} from "../../src/tlv.ts";
import { Logger } from "../deps.ts";

function toDrDate(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");

  return `${year}${month}${day}${hour}${minute}`;
}

export type BenchSmscStats = {
  connectionCount: number;
  failedAuthTotal: number;
  mtTotal: number;
  drTotal: number;
};

export async function runBenchSmsc(
  {
    authenticate,
    hostname,
    port,
    logger,
    signal,
    windowSize = 10,
    statsGetter,
  }: {
    authenticate: (systemId: string, password: string) => Promise<boolean> | boolean;
    hostname: string;
    port: number;
    logger: Logger;
    signal: AbortSignal;
    windowSize?: number;
    statsGetter?: (
      getStats: () => BenchSmscStats,
    ) => void;
  },
) {
  const server = Deno.listen({ hostname, port });
  logger.info?.("server is up at", JSON.stringify(server.addr));

  const stats = {
    connectionCount: 0,
    failedAuthTotal: 0,
    mtTotal: 0,
    drTotal: 0,
  };

  statsGetter?.(() => stats);

  const pendingClients = new Map<number, Promise<void>>();
  let clientIdSeed = 0;

  function onAbort() {
    logger.info?.("got termination signal, going to unbind all clients count:", pendingClients.size);
    terminationPromise.resolve();
  }

  signal.addEventListener("abort", onAbort);

  const terminationPromise = deferred<void>();

  const handlerPromise = (async () => {
    for await (const connection of server) {
      if (signal.aborted) break;

      const clientId = ++clientIdSeed;
      const remoteAddr = (() => {
        assert(connection.remoteAddr.transport === "tcp");
        return `${connection.remoteAddr.hostname}:${connection.remoteAddr.port}`;
      })();

      stats.connectionCount++;

      pendingClients.set(
        clientId,
        (async () => {
          try {
            logger.info?.("client started addr:", remoteAddr, "id:", clientId);

            const deliverSmQueue = new AsyncQueue<PduWithContext<DeliverSm, string>>(windowSize + 10);

            const smppPeer = createSmppPeer<string>({
              windowSize,
              connectionWriter: connection.writable.getWriter(),
              connectionReader: connection.readable.getReader({ mode: "byob" }),
              enquireLinkIntervalMs: 10_000,
              responseTimeoutMs: 5000,
              signal,
              tapIncomingPdu(pdu) {
                logger.debug?.(renderSmppPduAsTable(pdu));
              },
              tapOutgoingPdu(pdu) {
                logger.debug?.(renderSmppPduAsTable(pdu));
              },
            });

            const settledResults = await smppPeer.runSmsc({
              async authenticate({ commandId, sequenceNumber, systemId, password }) {
                const commandStatus = await authenticate(systemId, password)
                  ? SmppKnownCommandStatus.ESME_ROK
                  : SmppKnownCommandStatus.ESME_RINVPASWD;

                if (commandStatus !== SmppKnownCommandStatus.ESME_ROK) {
                  stats.failedAuthTotal++;
                }

                const responseCommandId = getBindResponseCommandId(commandId);

                return {
                  commandId: responseCommandId,
                  commandStatus,
                  sequenceNumber,
                  systemId: "Bench SMSC",
                  tlvs: SmppTlvs.empty,
                } satisfies BindResponse;
              },
              handle: () => {
                return Promise.resolve({
                  messageRequestQueue: deliverSmQueue, /* .initialDelay(2000).throttle(1, 2000) */
                  handleRemoteMessageResponse() {
                    stats.drTotal++;
                    return Promise.resolve();
                  },
                  async handleRemoteMessageRequest(submitSm) {
                    const messageId = crypto.randomUUID();
                    const date = toDrDate(new Date());
                    const shortMessage = smppCharsetEncode(
                      `id:${messageId} sub:001 dlvrd:001 submit date:${date} done date:${date} stat:DELIVRD err:000 text:`,
                      SmppSupportedCharset.Ascii,
                    );

                    const deliverSm: DeliverSm = {
                      commandId: SmppCommandId.DeliverSm,
                      commandStatus: SmppKnownCommandStatus.ESME_ROK,
                      sequenceNumber: 0,
                      sourceAddrNpi: submitSm.destAddrNpi,
                      sourceAddrTon: submitSm.destAddrTon,
                      sourceAddr: submitSm.destinationAddr,
                      destinationAddr: submitSm.sourceAddr,
                      destAddrNpi: submitSm.sourceAddrNpi,
                      destAddrTon: submitSm.sourceAddrTon,
                      serviceType: "",
                      esmClass: new SmppEsmClass(SmppMessagingMode.Default, SmppMessageType.SmscDeliveryReceipt),
                      protocolId: submitSm.protocolId,
                      priorityFlag: submitSm.priorityFlag,
                      scheduleDeliveryTime: "",
                      validityPeriod: "",
                      registeredDelivery: SmppRegisteredDelivery.None,
                      replaceIfPresentFlag: 0,
                      dataCoding: SmppKnownDataCoding.SmscDefaultAlphabet,
                      smDefaultMsgId: 0,
                      shortMessage,
                      smLength: shortMessage.length,
                      tlvs: new SmppTlvs([
                        {
                          tag: SmppKnownTlvTag.ReceiptedMessageId,
                          value: smppTlvEncodeReceiptedMessageId(messageId),
                        },
                        {
                          tag: SmppKnownTlvTag.NetworkErrorCode,
                          value: smppTlvEncodeNetworkErrorCode({
                            networkType: 0,
                            errorCode: 0,
                          }),
                        },
                        {
                          tag: SmppKnownTlvTag.MessageState,
                          value: smppTlvEncodeMessageState(SmppMessageState.Delivered),
                        },
                      ]),
                    };

                    await deliverSmQueue.enqueue({
                      pdu: deliverSm,
                      context: messageId,
                    });

                    const submitSmResp: SubmitSmResp = {
                      commandId: SmppCommandId.SubmitSmResp,
                      commandStatus: SmppKnownCommandStatus.ESME_ROK,
                      sequenceNumber: submitSm.sequenceNumber,
                      messageId,
                      tlvs: SmppTlvs.empty,
                    };

                    stats.mtTotal++;
                    return submitSmResp;
                  },
                });
              },
            });

            Object.entries(settledResults).forEach(
              ([key, result]) => {
                if (result.status === "rejected" && result.reason.name !== "AbortError") {
                  const reason = (result.reason instanceof WindowCorrelationError)
                    ? `WindowCorrelationError(uncorrelated=${result.reason.uncorrelated.length}): ${result.reason.message}`
                    : result.reason;
                  logger.info?.("client failed addr:", remoteAddr, "id:", clientId, "component:", key, reason);
                }
              },
            );
          } catch (error) {
            logger.info?.("client failed addr:", remoteAddr, "id:", clientId, error);
          } finally {
            logger.info?.("client ended addr:", remoteAddr, "id:", clientId);
            pendingClients.delete(clientId);
            try {
              connection.close();
            } catch (_) {
              // Ignore
            }
            stats.connectionCount--;
          }
        })(),
      );

      if (signal.aborted) break;
    }
  })().finally(() => terminationPromise.resolve());

  await terminationPromise;

  try {
    await promiseTimeout(
      5000,
      () => Promise.allSettled(pendingClients.values()),
      () => new Error(`there are still ${pendingClients.size} pending sessions`),
    );
  } catch (e) {
    logger.error?.("failed to cleanly unbind all clients in time", e);
  } finally {
    signal.removeEventListener("abort", onAbort);
    try {
      server.close();
    } catch (e) {
      logger.error?.("failed closing server", e);
    }
  }

  await handlerPromise;
}
