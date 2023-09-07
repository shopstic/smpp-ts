import { encodePdu } from "../lib/encoder.ts";
import {
  BindTransceiver,
  EnquireLink,
  EnquireLinkResp,
  isBindRequest,
  isSmppRequest,
  isSmppResponse,
  Pdu,
  SmppCommandId,
  SmppCommandIdByValueMap,
  SmppConnection,
  SmppNpi,
  SmppTon,
  Unbind,
  UnbindResp,
} from "../lib/common.ts";
import { SmppKnownCommandStatus, SmppKnownCommandStatusByValueMap } from "../lib/command_status.ts";
import { decodePdu } from "../lib/decoder.ts";
import { readSmppPdus } from "../lib/read_pdus.ts";
import { delay, signal, writeAll } from "../deps.ts";
import { AsyncQueue } from "../lib/async_queue.ts";
import { correlatePduWindow, PduCorrelationMatch } from "../lib/windowing.ts";
import { withTimeout } from "../lib/util.ts";

export async function runEsme(
  { windowSize = 10, connection, systemId, password, enquireLinkIntervalMs }: {
    windowSize: number;
    connection: SmppConnection;
    systemId: string;
    password: string;
    enquireLinkIntervalMs: number;
  },
) {
  const internalAc = new AbortController();
  const internalSignal = internalAc.signal;
  const outgoingQueue = new AsyncQueue<Pdu>(100);
  const esmeRequestQueue = new AsyncQueue<Pdu>(100);
  const smscResponseQueue = new AsyncQueue<Pdu>(100);
  const smscRequestQueue = new AsyncQueue<Pdu>(100);
  const esmeCorrelationMatchQueue = new AsyncQueue<PduCorrelationMatch>(100);

  const smscResponseQueues = {
    bind: new AsyncQueue<Pdu>(1),
    unbind: new AsyncQueue<Pdu>(1),
    enquireLink: new AsyncQueue<Pdu>(1),
    submit: new AsyncQueue<Pdu>(windowSize),
  };

  function internalAbort() {
    outgoingQueue.complete();
    esmeRequestQueue.complete();
    smscResponseQueue.complete();
    smscRequestQueue.complete();
    esmeCorrelationMatchQueue.complete();

    for (const q of Object.values(smscResponseQueues)) {
      q.complete();
    }
  }

  internalSignal.addEventListener("abort", internalAbort);

  const enqueueEsmeRequest = (() => {
    let sequenceNumber = 0;
    return async (pdu: Pdu) => {
      await esmeRequestQueue.enqueue({
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
        await smscRequestQueue.enqueue(pdu);
      } else if (isSmppResponse(pdu.commandId)) {
        await smscResponseQueue.enqueue(pdu);
      } else {
        throw new Error(`No handler for commandId=${pdu.commandId}\n${JSON.stringify(pdu)}`);
      }
    }
  }

  async function handleSmscRequests() {
    for await (const pdu of smscRequestQueue.items()) {
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
        throw new Error(`No handler for SMSC request commandId=${pdu.commandId}\n${JSON.stringify(pdu)}`);
      }
    }
  }

  async function handleEsmeRequests() {
    return await correlatePduWindow({
      windowSize,
      responseTimeoutMs: 5000,
      requests: esmeRequestQueue.items(),
      responses: smscResponseQueue.items(),
      sendRequest: async (request) => {
        await outgoingQueue.enqueue(request);
      },
      onMatch: (match) => {
        esmeCorrelationMatchQueue.enqueue(match);
        return Promise.resolve();
      },
      signal: internalSignal,
    });
  }

  async function handleEsmeCorrelationMatches() {
    for await (const { request, response } of esmeCorrelationMatchQueue.items()) {
      if (isBindRequest(request.commandId)) {
        smscResponseQueues.bind.enqueue(response);
      } else if (request.commandId === SmppCommandId.Unbind) {
        smscResponseQueues.unbind.enqueue(response);
      } else if (request.commandId === SmppCommandId.EnquireLink) {
        smscResponseQueues.enquireLink.enqueue(response);
      } else if (request.commandId === SmppCommandId.SubmitSm) {
        smscResponseQueues.submit.enqueue(response);
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

  async function handleEsmeBind() {
    const bindTransceiver: BindTransceiver = {
      commandId: SmppCommandId.BindTransceiver,
      commandStatus: SmppKnownCommandStatus.ESME_ROK,
      sequenceNumber: 0,
      systemId: systemId,
      password: password,
      systemType: "meh",
      interfaceVersion: 0x34,
      addrTon: SmppTon.International,
      addrNpi: SmppNpi.E164,
      addressRange: "abc",
    };

    await enqueueEsmeRequest(bindTransceiver);

    for await (const response of smscResponseQueues.bind.items()) {
      if (response.commandId !== SmppCommandId.BindTransceiverResp) {
        throw new Error(
          `Unexpected bind response commandId ${SmppCommandIdByValueMap.get(response.commandId) ?? response.commandId}`,
        );
      }

      if (response.commandStatus !== SmppKnownCommandStatus.ESME_ROK) {
        throw new Error(
          `Unexpected bind commandStatus ${
            SmppKnownCommandStatusByValueMap.get(response.commandStatus) ?? response.commandStatus
          }`,
        );
      }
      break;
    }

    smscResponseQueues.bind.complete();
  }

  async function handleEsmeUnbind() {
    const unbind: Unbind = {
      commandId: SmppCommandId.Unbind,
      commandStatus: SmppKnownCommandStatus.ESME_ROK,
      sequenceNumber: 0,
    };

    await enqueueEsmeRequest(unbind);

    for await (const response of smscResponseQueues.unbind.items()) {
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

    smscResponseQueues.unbind.complete();
  }

  async function handleEsmeEnquireLinks() {
    async function sendEnquireLink() {
      await delay(enquireLinkIntervalMs, {
        signal: internalSignal,
      });

      const enquireLink: EnquireLink = {
        commandId: SmppCommandId.EnquireLink,
        commandStatus: SmppKnownCommandStatus.ESME_ROK,
        sequenceNumber: 0,
      };

      await enqueueEsmeRequest(enquireLink);
    }

    await sendEnquireLink();

    for await (const response of smscResponseQueues.enquireLink.items()) {
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

  async function handleSignals() {
    for await (const _ of signal("SIGTERM", "SIGINT")) {
      console.log(`Got termination signal, going to unbind`);

      try {
        return await withTimeout("Unbind due to process termination signal", 3000, () => handleEsmeUnbind());
      } finally {
        internalAc.abort();
      }
    }
  }

  try {
    const promises = {
      outgoing: handleOutgoing(),
      incoming: handleIncoming(),
      esmeRequests: handleEsmeRequests(),
      esmeCorrelationMatches: handleEsmeCorrelationMatches(),
    };

    await handleEsmeBind();

    await Promise.all([
      handleSignals(),
      handleEsmeEnquireLinks(),
      handleSmscRequests(),
      ...Object.values(promises),
    ]);
  } catch (e) {
    if (e.name !== "AbortError") {
      throw e;
    }
  } finally {
    internalAc.abort();
    internalSignal.removeEventListener("abort", internalAbort);
  }
}
