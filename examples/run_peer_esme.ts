import { smppCharsetDecode, smppCharsetEncode } from "../src/charset.ts";
import { SmppKnownCommandStatus } from "../src/command_status.ts";
import {
  DeliverSm,
  DeliverSmResp,
  SmppCommandId,
  SmppKnownDataCoding,
  SmppNpi,
  SmppSupportedCharset,
  SmppTon,
  SubmitSm,
  SubmitSmResp,
} from "../src/common.ts";
import { assertEquals, deferred } from "../src/deps/std.ts";
import { AsyncQueue, promiseTimeout } from "../src/deps/utils.ts";
import { SmppEsmClass, SmppMessageType, SmppMessagingMode } from "../src/esm_class.ts";
import { createSmppPeer, PduWithContext } from "../src/peer.ts";
import { renderSmppPduAsTable } from "../src/prettify.ts";
import { SmppRegisteredDelivery } from "../src/registered_delivery.ts";
import { SmppTlvs } from "../src/tlv.ts";

const connection = await promiseTimeout(
  2000,
  () => Deno.connect({ hostname: "127.0.0.1", port: 12775 }),
  () => new Error("Failed to connect to SMSC within 2s"),
);

const systemId = "foo";
const password = "bar";

const abortController = new AbortController();

const windowSize = 10;

type MtCtx = number;
type Mt = PduWithContext<SubmitSm, MtCtx>;

const submitSmDefaults = {
  commandStatus: SmppKnownCommandStatus.ESME_ROK,
  sequenceNumber: 0,
  serviceType: "",
  sourceAddrTon: SmppTon.International,
  sourceAddrNpi: SmppNpi.E164,
  destAddrTon: SmppTon.International,
  destAddrNpi: SmppNpi.E164,
  esmClass: new SmppEsmClass(
    SmppMessagingMode.Default,
    SmppMessageType.NormalMessage,
  ),
  protocolId: 0,
  priorityFlag: 0,
  scheduleDeliveryTime: "",
  validityPeriod: "",
  registeredDelivery: SmppRegisteredDelivery.All,
  replaceIfPresentFlag: 0,
  dataCoding: 0,
  smDefaultMsgId: 0,
  tlvs: SmppTlvs.empty,
};

type SubmitSmWithDefaults =
  & Omit<SubmitSm, "smLength" | "commandId" | keyof typeof submitSmDefaults>
  & Partial<typeof submitSmDefaults>;

function createSubmitSm(fields: SubmitSmWithDefaults): SubmitSm {
  const smLength = fields.shortMessage?.length ?? 0;

  return {
    ...submitSmDefaults,
    ...fields,
    commandId: SmppCommandId.SubmitSm,
    smLength,
  };
}

type DrWithResponder = {
  pdu: DeliverSm;
  respond: (drResp: DeliverSmResp) => Promise<void>;
};

const submitSmQueue = new AsyncQueue<Mt>(windowSize, { rejectOnFull: true });
const submitSmRespQueue = new AsyncQueue<{
  request: Mt;
  response: SubmitSmResp;
}>(windowSize, { rejectOnFull: true });
const deliverSmQueue = new AsyncQueue<DrWithResponder>(windowSize, { rejectOnFull: true });

async function sendMt(mt: Mt) {
  await submitSmQueue.enqueue(mt);
}

async function expectMtResps(forMtCtxs: Set<MtCtx>) {
  const collectedMtResps = new Map<MtCtx, SubmitSmResp>();

  for await (const { request, response } of submitSmRespQueue.items()) {
    let matched: MtCtx | undefined;

    for (const forMtCtx of forMtCtxs) {
      if (
        request.context === forMtCtx
      ) {
        matched = forMtCtx;
      }
    }

    if (matched === undefined) {
      throw new Error(
        `Received an unexpected MT response for request ${JSON.stringify(request)}`,
      );
    }

    collectedMtResps.set(matched, response);
    if (collectedMtResps.size === forMtCtxs.size) {
      return collectedMtResps;
    }
  }

  throw new Error(`Expected an MT response but got none`);
}

async function _expectMtResp(forMtCtx: MtCtx) {
  return await expectMtResps(new Set([forMtCtx]));
}

async function _expectDr(withMessageId: string, discardUnmatched = false) {
  return await expectDrs(new Set([withMessageId]), discardUnmatched);
}

async function expectDrs(withMessageIds: Set<string>, discardUnmatched = false) {
  const collectedDrs = new Map<string, DrWithResponder>();

  for await (const { pdu, respond } of deliverSmQueue.items()) {
    const messageType = pdu.esmClass.messageType;
    if (
      messageType === SmppMessageType.SmscDeliveryReceipt ||
      messageType === SmppMessageType.DeliveryAcknowledgement ||
      messageType === SmppMessageType.IntermediateDeliveryNotification ||
      messageType === SmppMessageType.ManualUserAcknowledgement
    ) {
      const receiptedMessageId = pdu.tlvs.receiptedMessageId;

      if (receiptedMessageId) {
        if (withMessageIds.has(receiptedMessageId)) {
          collectedDrs.set(receiptedMessageId, { pdu, respond });
          if (collectedDrs.size === withMessageIds.size) {
            return collectedDrs;
          }
          continue;
        }

        if (!discardUnmatched) {
          throw new Error(
            `Received a DR with an unexpected messageId=${receiptedMessageId}. Expected ${withMessageIds}`,
          );
        }

        console.warn("Discarding a DR with messageId", receiptedMessageId);
      } else {
        console.warn("Discarding a DR with unknown messageId");
      }
    } else {
      console.warn("Discarding an MO");
    }

    await respond({
      commandId: SmppCommandId.DeliverSmResp,
      sequenceNumber: pdu.sequenceNumber,
      commandStatus: SmppKnownCommandStatus.ESME_ROK,
      messageId: "",
      tlvs: SmppTlvs.empty,
    });
  }

  throw new Error(`Expected a DR with messageIds=${withMessageIds} but got none`);
}

const esmePromise = (async () => {
  let connectionExplicitlyClosed = false;
  try {
    const smppPeer = createSmppPeer<MtCtx>({
      windowSize: 10,
      connection: {
        async read(p: Uint8Array): Promise<number | null> {
          try {
            return await connection.read(p);
          } catch (e) {
            if (!connectionExplicitlyClosed) {
              throw e;
            }
            return null;
          }
        },
        write(p: Uint8Array): Promise<number> {
          return connection.write(p);
        },
      },
      responseTimeoutMs: 5000,
      enquireLinkIntervalMs: 5000,
      signal: abortController.signal,
      tapIncomingPdu(pdu) {
        console.log(renderSmppPduAsTable(pdu));
      },
      tapOutgoingPdu(pdu) {
        console.log(renderSmppPduAsTable(pdu));
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
          messageRequestQueue: submitSmQueue,
          async handleRemoteMessageResponse(request: Mt, response: SubmitSmResp) {
            await submitSmRespQueue.enqueue({ request, response });
          },
          async handleRemoteMessageRequest(request: DeliverSm) {
            const deferredResponse = deferred<DeliverSmResp>();

            deliverSmQueue.enqueue({
              pdu: request,
              respond: async (response: DeliverSmResp) => {
                deferredResponse.resolve(response);
                await deferredResponse;
                return;
              },
            });

            return await deferredResponse;
          },
        }),
    });

    for (const [key, result] of Object.entries(settledResults)) {
      if (result.status === "rejected" && result.reason.name !== "AbortError") {
        console.error(`Client failed component=${key}`, result.reason);
      }
    }
  } catch (e) {
    console.error(`Client failed`, e);
  } finally {
    console.error("Closing connection");
    connectionExplicitlyClosed = true;
    connection.close();
    console.error("Closed connection");
  }
})();

const testPromise = (async () => {
  const mt1 = {
    context: 1,
    pdu: createSubmitSm({
      sourceAddr: "+12001234567",
      destinationAddr: "+12001234568",
      shortMessage: smppCharsetEncode("Test 1 from smpp-ts in ASCII", SmppSupportedCharset.Ascii),
      dataCoding: SmppKnownDataCoding.Ia5,
    }),
  };

  const mt2 = {
    context: 2,
    pdu: createSubmitSm({
      sourceAddr: "+12001234567",
      destinationAddr: "+12001234569",
      shortMessage: smppCharsetEncode("Thử tiếng việt smpp-ts bằng UCS-2 🌭", SmppSupportedCharset.Ucs2),
      dataCoding: SmppKnownDataCoding.Ucs2,
    }),
  };

  await Promise.all([
    sendMt(mt1),
    sendMt(mt2),
  ]);

  const mtResps = await expectMtResps(new Set([mt1.context, mt2.context]));
  const mtResp1 = mtResps.get(mt1.context)!;

  assertEquals(mtResp1.commandStatus, SmppKnownCommandStatus.ESME_ROK, "command_status should be ESME_ROK");
  const msgId1 = mtResp1.messageId;

  const mtResp2 = mtResps.get(mt2.context)!;
  const msgId2 = mtResp2.messageId;
  assertEquals(mtResp2.commandStatus, SmppKnownCommandStatus.ESME_ROK), "command_status should be ESME_ROK";

  const msgIds = new Set([msgId1, msgId2]);
  console.error("Got MT responses", msgIds);
  const drs = await expectDrs(msgIds, true);

  for (const [drMsgId, { pdu, respond: respondDr }] of drs.entries()) {
    console.error(`Got DR for messageId=${drMsgId}`, smppCharsetDecode(pdu.shortMessage, SmppSupportedCharset.Ascii));

    await respondDr({
      commandId: SmppCommandId.DeliverSmResp,
      sequenceNumber: pdu.sequenceNumber,
      commandStatus: SmppKnownCommandStatus.ESME_ROK,
      messageId: "",
      tlvs: SmppTlvs.empty,
    });
  }

  console.error("All done, stopping");
  abortController.abort();
})();

const signals: Deno.Signal[] = ["SIGTERM", "SIGINT"];

function onTerminationSignal() {
  signals.forEach((signal) => Deno.removeSignalListener(signal, onTerminationSignal));

  console.error(`Got termination signal, going to unbind`);
  abortController.abort();

  promiseTimeout(5000, () => esmePromise, () => new Error("Client hasn't cleanly returned after 5s"))
    .catch((e) => {
      console.error("Failed to cleanly unbind", e);
      connection.close();
    });
}

signals.forEach((signal) => Deno.addSignalListener(signal, onTerminationSignal));

let testCompleted = false;

await Promise.all([
  esmePromise.then(() => {
    if (!testCompleted) {
      return Promise.reject(new Error("ESME completed prematurely"));
    }
  }),
  promiseTimeout(
    10000,
    () =>
      testPromise.then(() => {
        testCompleted = true;
      }),
    () => new Error("Test hasn't completed after 10s"),
  ),
]);
self.close();
