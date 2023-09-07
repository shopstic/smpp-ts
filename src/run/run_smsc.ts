import { encodePdu } from "../lib/encoder.ts";
import {
  BindTransceiver,
  BindTransceiverResp,
  EnquireLink,
  EnquireLinkResp,
  isBindRequest,
  isSmppRequest,
  isSmppResponse,
  Pdu,
  SmppCommandId,
  SmppCommandIdByValueMap,
  SmppConnection,
  Unbind,
  UnbindResp,
} from "../lib/common.ts";
import { SmppKnownCommandStatus, SmppKnownCommandStatusByValueMap } from "../lib/command_status.ts";
import { decodePdu } from "../lib/decoder.ts";
import { readSmppPdus } from "../lib/read_pdus.ts";
import { delay, writeAll } from "../deps.ts";
import { AsyncQueue } from "../lib/async_queue.ts";
import { correlatePduWindow, PduCorrelationMatch } from "../lib/windowing.ts";
import { withTimeout } from "../lib/util.ts";
import { deferred } from "https://deno.land/std@0.200.0/async/deferred.ts";

export async function runSmsc(
  { windowSize = 10, connection, enquireLinkIntervalMs, authenticate, signal: externalSignal }: {
    windowSize: number;
    connection: SmppConnection;
    enquireLinkIntervalMs: number;
    authenticate(auth: { systemId: string; password: string }): Promise<boolean>;
    signal: AbortSignal;
  },
) {
  const internalAc = new AbortController();
  const internalSignal = internalAc.signal;
  const outgoingQueue = new AsyncQueue<Pdu>(100);
  const smscRequestQueue = new AsyncQueue<Pdu>(100);
  const esmeResponseQueue = new AsyncQueue<Pdu>(100);
  const esmeRequestQueue = new AsyncQueue<Pdu>(100);
  const smscCorrelationMatchQueue = new AsyncQueue<PduCorrelationMatch>(100);
  const externalAbortQueue = new AsyncQueue<number>(1);

  const esmeResponseQueues = {
    unbind: new AsyncQueue<Pdu>(1),
    enquireLink: new AsyncQueue<Pdu>(1),
    deliver: new AsyncQueue<Pdu>(windowSize),
  };

  function internalAbort() {
    outgoingQueue.complete();
    smscRequestQueue.complete();
    esmeResponseQueue.complete();
    esmeRequestQueue.complete();
    smscCorrelationMatchQueue.complete();
    externalAbortQueue.complete();

    for (const q of Object.values(esmeResponseQueues)) {
      q.complete();
    }
  }

  function externalAbort() {
    externalAbortQueue.enqueue(1);
  }

  externalSignal.addEventListener("abort", externalAbort);
  internalSignal.addEventListener("abort", internalAbort);

  const enqueueSmscRequest = (() => {
    let sequenceNumber = 0;
    return async (pdu: Pdu) => {
      await smscRequestQueue.enqueue({
        ...pdu,
        sequenceNumber: ++sequenceNumber,
      });
    };
  })();

  async function handleOutgoing() {
    for await (const pdu of outgoingQueue.items()) {
      console.log(
        `>> commandId=${SmppCommandIdByValueMap.get(pdu.commandId)} commandStatus=${
          SmppKnownCommandStatusByValueMap.get(pdu.commandStatus)
        }`,
        pdu,
      );
      await writeAll(connection, encodePdu(pdu));
    }
  }

  async function handleIncoming() {
    for await (const raw of readSmppPdus(connection)) {
      if (internalSignal.aborted) {
        return;
      }

      const pdu = decodePdu(raw);

      console.log(
        `<< commandId=${SmppCommandIdByValueMap.get(pdu.commandId)} commandStatus=${
          SmppKnownCommandStatusByValueMap.get(pdu.commandStatus)
        }`,
        pdu,
      );

      if (isSmppRequest(pdu.commandId)) {
        await esmeRequestQueue.enqueue(pdu);
      } else if (isSmppResponse(pdu.commandId)) {
        await esmeResponseQueue.enqueue(pdu);
      } else {
        throw new Error(`No handler for commandId=${pdu.commandId}\n${JSON.stringify(pdu)}`);
      }
    }
  }

  async function handleEsmeBind() {
    for await (const pdu of esmeRequestQueue.items()) {
      if (isBindRequest(pdu.commandId)) {
        const bindPdu = pdu as BindTransceiver;

        if (
          await authenticate({
            systemId: bindPdu.systemId,
            password: bindPdu.password,
          })
        ) {
          const bindResp: BindTransceiverResp = {
            commandId: SmppCommandId.BindTransceiverResp,
            commandStatus: SmppKnownCommandStatus.ESME_ROK,
            sequenceNumber: pdu.sequenceNumber,
            systemId: "SMSC Here",
            tlvs: [],
          };
          await outgoingQueue.enqueue(bindResp);
          return true;
        }

        const bindResp: BindTransceiverResp = {
          commandId: SmppCommandId.BindTransceiverResp,
          commandStatus: SmppKnownCommandStatus.ESME_RINVPASWD,
          sequenceNumber: pdu.sequenceNumber,
          systemId: "SMSC Here",
          tlvs: [],
        };

        await outgoingQueue.enqueue(bindResp);

        return false;
      }

      throw new Error(`No handler for ESME request commandId=${pdu.commandId}\n${JSON.stringify(pdu)}`);
    }
  }

  async function handleEsmeRequests() {
    for await (const pdu of esmeRequestQueue.items()) {
      if (pdu.commandId === SmppCommandId.EnquireLink) {
        const enquireLinkResp: EnquireLinkResp = {
          commandId: SmppCommandId.EnquireLinkResp,
          commandStatus: SmppKnownCommandStatus.ESME_ROK,
          sequenceNumber: pdu.sequenceNumber,
        };

        await outgoingQueue.enqueue(enquireLinkResp);
      } else if (pdu.commandId === SmppCommandId.Unbind) {
        const unbindResp: UnbindResp = {
          commandId: SmppCommandId.UnbindResp,
          commandStatus: SmppKnownCommandStatus.ESME_ROK,
          sequenceNumber: pdu.sequenceNumber,
        };
        await outgoingQueue.enqueue(unbindResp);
        internalAc.abort();
      } else {
        throw new Error(`No handler for ESME request commandId=${pdu.commandId}\n${JSON.stringify(pdu)}`);
      }
    }
  }

  async function handleSmscRequests() {
    return await correlatePduWindow({
      windowSize,
      responseTimeoutMs: 5000,
      requests: smscRequestQueue.items(),
      responses: esmeResponseQueue.items(),
      sendRequest: async (request) => {
        await outgoingQueue.enqueue(request);
      },
      onMatch: (match) => {
        smscCorrelationMatchQueue.enqueue(match);
        return Promise.resolve();
      },
      signal: internalSignal,
    });
  }

  async function handleEsmeCorrelationMatches() {
    for await (const { request, response } of smscCorrelationMatchQueue.items()) {
      if (request.commandId === SmppCommandId.Unbind) {
        esmeResponseQueues.unbind.enqueue(response);
      } else if (request.commandId === SmppCommandId.EnquireLink) {
        esmeResponseQueues.enquireLink.enqueue(response);
      } else if (request.commandId === SmppCommandId.DeliverSm) {
        esmeResponseQueues.deliver.enqueue(response);
      } else {
        throw new Error(
          [
            "Got a unknown correlation match",
            "Request:",
            JSON.stringify(request),
            "Response:",
            JSON.stringify(response),
          ].join("\n"),
        );
      }
    }
  }

  async function handleSmscUnbind() {
    const unbind: Unbind = {
      commandId: SmppCommandId.Unbind,
      commandStatus: SmppKnownCommandStatus.ESME_ROK,
      sequenceNumber: 0,
    };

    await enqueueSmscRequest(unbind);

    for await (const response of esmeResponseQueues.unbind.items()) {
      if (response.commandId !== SmppCommandId.UnbindResp) {
        throw new Error(
          `Unexpected unbind response commandId ${
            SmppCommandIdByValueMap.get(response.commandId) ?? response.commandId
          }`,
        );
      }

      if (response.commandStatus !== SmppKnownCommandStatus.ESME_ROK) {
        throw new Error(
          `Unexpected unbind commandStatus ${
            SmppKnownCommandStatusByValueMap.get(response.commandStatus) ?? response.commandStatus
          }`,
        );
      }
      break;
    }

    internalAc.abort();
  }

  async function handleSmscEnquireLinks() {
    async function sendEnquireLink() {
      await delay(enquireLinkIntervalMs, {
        signal: internalSignal,
      });

      const enquireLink: EnquireLink = {
        commandId: SmppCommandId.EnquireLink,
        commandStatus: SmppKnownCommandStatus.ESME_ROK,
        sequenceNumber: 0,
      };

      await enqueueSmscRequest(enquireLink);
    }

    await sendEnquireLink();

    for await (const response of esmeResponseQueues.enquireLink.items()) {
      if (response.commandId !== SmppCommandId.EnquireLinkResp) {
        throw new Error(
          `Unexpected enquire_link response commandId ${
            SmppCommandIdByValueMap.get(response.commandId) ?? response.commandId
          }`,
        );
      }

      if (response.commandStatus !== SmppKnownCommandStatus.ESME_ROK) {
        throw new Error(
          `Unexpected enquire_link response commandStatus ${
            SmppKnownCommandStatusByValueMap.get(response.commandStatus) ?? response.commandStatus
          }`,
        );
      }

      await sendEnquireLink();
    }
  }

  async function handleExternalAbort() {
    for await (const _ of externalAbortQueue.items()) {
      try {
        return await withTimeout("Unbind due to external abort signal", 3000, () => handleSmscUnbind());
      } finally {
        internalAc.abort();
      }
    }
  }

  try {
    const promises = {
      outgoing: handleOutgoing(),
      incoming: handleIncoming(),
      esmeRequests: handleSmscRequests(),
      esmeCorrelationMatches: handleEsmeCorrelationMatches(),
    };

    const isBound = await handleEsmeBind();

    if (isBound) {
      await Promise.all([
        handleExternalAbort(),
        handleSmscEnquireLinks(),
        handleEsmeRequests(),
        ...Object.values(promises),
      ]);
    } else {
      internalAbort();
      await Promise.all([
        ...Object.values(promises),
      ]);
    }
  } catch (e) {
    if (e.name !== "AbortError") {
      throw e;
    }
  } finally {
    internalAc.abort();
    internalSignal.removeEventListener("abort", internalAbort);
    externalSignal.removeEventListener("abort", externalAbort);
  }
}
