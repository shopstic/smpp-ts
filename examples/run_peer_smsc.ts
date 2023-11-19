import { smppCharsetEncode } from "../src/charset.ts";
import { SmppKnownCommandStatus } from "../src/command_status.ts";
import {
  BindRequest,
  BindResponse,
  DeliverSm,
  getBindResponseCommandId,
  SmppCommandId,
  SmppKnownDataCoding,
  SmppSupportedCharset,
  SubmitSmResp,
} from "../src/common.ts";
import { AsyncQueue, promiseTimeout } from "../src/deps/utils.ts";
import { SmppEsmClass, SmppMessageType, SmppMessagingMode } from "../src/esm_class.ts";
import { SmppMessageState } from "../src/message_state.ts";
import { createSmppPeer, PduWithContext } from "../src/peer.ts";
import { SmppRegisteredDelivery } from "../src/registered_delivery.ts";
import {
  SmppKnownTlvTag,
  smppTlvEncodeMessageState,
  smppTlvEncodeNetworkErrorCode,
  smppTlvEncodeReceiptedMessageId,
  SmppTlvs,
} from "../src/tlv.ts";

const server = Deno.listen({ port: 12775 });
console.log("SMSC Server is up on port 12775");

const abortController = new AbortController();
const pendingClients = new Map<number, Promise<void>>();
let clientIdSeed = 0;

function toDrDate(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");

  return `${year}${month}${day}${hour}${minute}`;
}

(async () => {
  for await (const connection of server) {
    const clientId = ++clientIdSeed;
    const remoteAddr = (() => {
      if (connection.remoteAddr.transport === "tcp") {
        return `${connection.remoteAddr.hostname}:${connection.remoteAddr.port}`;
      }
      return JSON.stringify(connection.remoteAddr);
    })();

    pendingClients.set(
      clientId,
      (async () => {
        try {
          console.log(`Client addr=${remoteAddr} id=${clientId} start`);

          const windowSize = 100;
          const deliverSmQueue = new AsyncQueue<PduWithContext<DeliverSm, string>>(windowSize);

          const smppPeer = createSmppPeer<string>({
            windowSize,
            connectionWriter: connection.writable.getWriter(),
            connectionReader: connection.readable.getReader({ mode: "byob" }),
            enquireLinkIntervalMs: 5000,
            responseTimeoutMs: 5000,
            signal: abortController.signal,
            tapIncomingPdu(_pdu) {
              // console.log(renderSmppPduAsTable(pdu));
            },
            tapOutgoingPdu(_pdu) {
              // console.log(renderSmppPduAsTable(pdu));
            },
          });

          const settledResults = await smppPeer.runSmsc({
            authenticate({ commandId, sequenceNumber, systemId, password }: BindRequest) {
              const commandStatus = (systemId === "foo" && password === "bar")
                ? SmppKnownCommandStatus.ESME_ROK
                : SmppKnownCommandStatus.ESME_RINVPASWD;

              const responseCommandId = getBindResponseCommandId(commandId);

              const bindResponse: BindResponse = {
                commandId: responseCommandId,
                commandStatus,
                sequenceNumber,
                systemId: "Test SMSC",
                tlvs: SmppTlvs.empty,
              };

              return Promise.resolve(bindResponse);
            },
            handle: () => {
              return Promise.resolve({
                messageRequestQueue: deliverSmQueue, /* .initialDelay(2000).throttle(1, 2000) */
                handleRemoteMessageResponse() {
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

                  return submitSmResp;
                },
              });
            },
          });

          Object.entries(settledResults).forEach(
            ([key, result]) => {
              if (result.status === "rejected" && result.reason.name !== "AbortError") {
                console.log(
                  `Client addr=${remoteAddr} id=${clientId} failed component=${key}`,
                  result.reason,
                );
              }
            },
          );
        } catch (error) {
          console.log(`Client addr=${remoteAddr} id=${clientId} failed`, error);
        } finally {
          console.log(`Client addr=${remoteAddr} id=${clientId} end`);
          pendingClients.delete(clientId);
          connection.close();
        }
      })(),
    );
  }
})();

async function terminate(signal: Deno.Signal) {
  console.log(`Got ${signal} signal, going to unbind all clients (${pendingClients.size})`);
  abortController.abort();

  try {
    await promiseTimeout(
      5000,
      () => Promise.allSettled(pendingClients.values()),
      () => new Error("All clients haven't cleanly completed after 5s"),
    );
  } catch (e) {
    console.log("Failed to cleanly unbind all clients in time", e);
  } finally {
    server.close();
  }
}

const signals = ["SIGTERM", "SIGINT"] as const;

signals.forEach((signal) => {
  const callback = () => {
    Deno.removeSignalListener(signal, callback);
    terminate(signal);
  };
  Deno.addSignalListener(signal, callback);
});
