import { encodePdu } from "./encoder.ts";
import {
  BindRequest,
  BindResponse,
  DeliverSm,
  DeliverSmResp,
  EnquireLink,
  EnquireLinkResp,
  isPduBindRequest,
  isPduRequest,
  isPduResponse,
  MessageRequest,
  MessageResponse,
  SmppCommandId,
  SmppConnection,
  SmppPdu,
  SubmitSm,
  SubmitSmResp,
  Unbind,
  UnbindResp,
} from "./common.ts";
import { decodePdu } from "./decoder.ts";
import { readSmppPdus } from "./read_pdus.ts";
import { deferred, delay, writeAll } from "./deps/std.ts";
import { prettifySmppCommandId, prettifySmppCommandStatus } from "./prettify.ts";
import { SmppKnownCommandStatus } from "./command_status.ts";
import {
  AsyncQueue,
  AsyncReadonlyQueue,
  correlateWindow,
  promiseAllSettledTogether,
  promiseTimeout,
  WindowCorrelationMatch,
} from "./deps/utils.ts";

export type PduTx<Req, Res> = {
  request: Req;
  response: Res;
};

type MsgTx<
  Req extends MessageRequest = MessageRequest,
  Res extends MessageResponse = MessageResponse,
> = PduTx<
  Req,
  Res
>;
type BindTx = PduTx<BindRequest, BindResponse>;

// deno-lint-ignore no-explicit-any
export interface PduWithContext<P = SmppPdu, C = any> {
  pdu: P;
  context: C;
}

export type PduCorrelationMatch = WindowCorrelationMatch<
  SmppPdu,
  SmppPdu,
  number
>;

interface MessagesHandler<
  Local extends MsgTx,
  Remote extends MsgTx,
  Ctx = void,
> {
  messageRequestQueue: AsyncReadonlyQueue<
    PduWithContext<Local["request"], Ctx>
  >;
  handleRemoteMessageResponse: (
    request: PduWithContext<Local["request"], Ctx>,
    response: Local["response"],
  ) => Promise<void>;
  handleRemoteMessageRequest: (
    request: Remote["request"],
  ) => Promise<Remote["response"]>;
}

type MtTx = MsgTx<SubmitSm, SubmitSmResp>;
type DrTx = MsgTx<DeliverSm, DeliverSmResp>;

type RunnableSmppPeer<LocalMsgCtx> = {
  runEsme: (_: {
    bindRequest: BindRequest;
    handle: (bindTx: BindTx) => Promise<
      MessagesHandler<MtTx, DrTx, LocalMsgCtx>
    >;
  }) => Promise<Record<string, PromiseSettledResult<unknown>>>;
  runSmsc: (_: {
    authenticate(request: BindRequest): Promise<BindResponse>;
    handle: (bindTx: BindTx) => Promise<
      MessagesHandler<DrTx, MtTx, LocalMsgCtx>
    >;
  }) => Promise<Record<string, PromiseSettledResult<unknown>>>;
};

const MAX_SEQUENCE_NUMBER = 0x7FFFFFFE;

export function createSmppPeer<
  LocalMsgCtx,
>(
  {
    windowSize = 10,
    connection,
    enquireLinkIntervalMs,
    signal: externalSignal,
    responseTimeoutMs = 5000,
    tapOutgoingPdu,
    tapIncomingPdu,
  }: {
    windowSize: number;
    connection: SmppConnection;
    enquireLinkIntervalMs: number;
    signal: AbortSignal;
    responseTimeoutMs?: number;
    tapOutgoingPdu?: (pdu: SmppPdu) => void;
    tapIncomingPdu?: (pdu: SmppPdu) => void;
  },
): RunnableSmppPeer<LocalMsgCtx> {
  type BindHandler = (
    b: BindTx,
  ) => Promise<MessagesHandler<MsgTx, MsgTx, LocalMsgCtx>>;

  const internalAc = new AbortController();
  const internalSignal = internalAc.signal;
  const incomingRawQueue = new AsyncQueue<Uint8Array>();
  const outgoingQueue = new AsyncQueue<SmppPdu>();
  const localRequestQueue = new AsyncQueue<PduWithContext>();
  const remoteResponseQueue = new AsyncQueue<SmppPdu>();
  const remoteRequestQueue = new AsyncQueue<SmppPdu>();
  const localCorrelationMatchQueue = new AsyncQueue<
    WindowCorrelationMatch<PduWithContext, SmppPdu, number>
  >(
    1,
  );
  const externalAbortQueue = new AsyncQueue<unknown>();
  const remoteMessageRequestQueue = new AsyncQueue<MessageRequest>();
  const localMessageResponsePromiseQueue = new AsyncQueue<
    Promise<MessageResponse>
  >();
  let localMessageRequestQueue:
    | AsyncReadonlyQueue<PduWithContext<MessageRequest, LocalMsgCtx>>
    | null = null;

  let outstandingRemoteUnbindRequest: Unbind | null = null;

  const connReadPromise = deferred<void>();

  const remoteResponseQueues = {
    bind: new AsyncQueue<PduTx<BindRequest, BindResponse>>(),
    unbind: new AsyncQueue<PduTx<Unbind, UnbindResp>>(),
    enquireLink: new AsyncQueue<PduTx<EnquireLink, EnquireLinkResp>>(),
    message: new AsyncQueue<
      PduTx<PduWithContext<MessageRequest, LocalMsgCtx>, MessageResponse>
    >(),
  };

  function internalAbort() {
    incomingRawQueue.complete();
    outgoingQueue.complete();
    externalAbortQueue.complete();
    remoteMessageRequestQueue.complete();
    localMessageResponsePromiseQueue.complete();
    localMessageRequestQueue?.complete();
    connReadPromise.resolve();
  }

  function externalAbort() {
    if (!externalAbortQueue.isCompleted) {
      externalAbortQueue.enqueue(1);
    }
  }

  const enqueueLocalRequest = (() => {
    let sequenceNumber = 0;
    let unbound = false;

    const nextSeq = () => {
      if (sequenceNumber >= MAX_SEQUENCE_NUMBER) {
        sequenceNumber = 0;
      }
      return ++sequenceNumber;
    };

    return async (pdu: SmppPdu, context?: unknown) => {
      if (!unbound && pdu.commandId === SmppCommandId.Unbind) {
        unbound = true;
        return await localRequestQueue.enqueue({
          context,
          pdu: {
            ...pdu,
            sequenceNumber: nextSeq(),
          },
        }).finally(() => localRequestQueue.complete());
      } else if (unbound) {
        return false;
      }

      return await localRequestQueue.enqueue({
        context,
        pdu: {
          ...pdu,
          sequenceNumber: nextSeq(),
        },
      });
    };
  })();

  async function loopOutgoing() {
    try {
      for await (const pdu of outgoingQueue.items()) {
        tapOutgoingPdu?.(pdu);
        await writeAll(connection, encodePdu(pdu));
      }
    } catch (e) {
      internalAc.abort();
      throw e;
    } finally {
      localRequestQueue.complete();
    }
  }

  async function loopIncomingRaw() {
    try {
      for await (
        const raw of readSmppPdus(connection)
      ) {
        if (incomingRawQueue.isCompleted || !await incomingRawQueue.enqueue(raw)) return;
      }
    } catch (e) {
      if (!incomingRawQueue.isCompleted) {
        connReadPromise.reject(e);
      }
    } finally {
      incomingRawQueue.complete();
    }
  }

  async function loopIncoming() {
    try {
      for await (const raw of incomingRawQueue.items()) {
        const pdu = decodePdu(raw);

        tapIncomingPdu?.(pdu);

        if (isPduRequest(pdu)) {
          if (!await remoteRequestQueue.enqueue(pdu)) return;
        } else if (isPduResponse(pdu)) {
          if (!await remoteResponseQueue.enqueue(pdu)) return;
        } else {
          throw new Error(
            `No handler for commandId=${pdu.commandId}\n${JSON.stringify(pdu)}`,
          );
        }
      }
    } finally {
      remoteRequestQueue.complete();
      remoteResponseQueue.complete();
      internalAc.abort();
    }
  }

  async function loopRemoteRequests(role: "esme" | "smsc") {
    try {
      for await (const pdu of remoteRequestQueue.items()) {
        if (pdu.commandId === SmppCommandId.EnquireLink) {
          const enquireLinkResp: EnquireLinkResp = {
            commandId: SmppCommandId.EnquireLinkResp,
            commandStatus: SmppKnownCommandStatus.ESME_ROK,
            sequenceNumber: pdu.sequenceNumber,
          };

          await outgoingQueue.enqueue(enquireLinkResp);
        } else if (pdu.commandId === SmppCommandId.Unbind) {
          localRequestQueue.complete();
          remoteMessageRequestQueue.complete();
          outstandingRemoteUnbindRequest = pdu;
        } else if (
          (role === "esme" && pdu.commandId === SmppCommandId.DeliverSm) ||
          role === "smsc" && pdu.commandId === SmppCommandId.SubmitSm
        ) {
          await remoteMessageRequestQueue.enqueue(pdu);
        } else {
          throw new Error(
            `No handler for remote request with command_id=${prettifySmppCommandId(pdu.commandId)}`,
          );
        }
      }
    } catch (e) {
      internalAc.abort();
      throw e;
    }
  }

  async function loopLocalRequests() {
    try {
      return await correlateWindow<PduWithContext, SmppPdu>({
        windowSize,
        responseTimeoutMs,
        requests: localRequestQueue,
        responses: remoteResponseQueue,
        extractRequestId: (req) => req.pdu.sequenceNumber,
        extractResponseId: (pdu) => pdu.sequenceNumber,
        sendRequest: async (request) => {
          await outgoingQueue.enqueue(request.pdu);
        },
        onMatch: (match) => {
          localCorrelationMatchQueue.enqueue(match);
          return Promise.resolve();
        },
        signal: internalSignal,
        completionTimeoutMs: responseTimeoutMs,
      });
    } catch (e) {
      internalAc.abort();
      throw e;
    } finally {
      localCorrelationMatchQueue.complete();

      if (outstandingRemoteUnbindRequest && !outgoingQueue.isCompleted) {
        const unbindResp: UnbindResp = {
          commandId: SmppCommandId.UnbindResp,
          commandStatus: SmppKnownCommandStatus.ESME_ROK,
          sequenceNumber: outstandingRemoteUnbindRequest.sequenceNumber,
        };
        outstandingRemoteUnbindRequest = null;

        await outgoingQueue.enqueue(unbindResp);
      }
    }
  }

  async function loopLocalCorrelationMatches(role: "esme" | "smsc") {
    try {
      for await (
        const { request, response } of localCorrelationMatchQueue.items()
      ) {
        const { pdu } = request;

        if (role === "esme" && isPduBindRequest(pdu)) {
          await remoteResponseQueues.bind.enqueue({
            request: pdu,
            response: response as BindResponse,
          });
        } else if (pdu.commandId === SmppCommandId.Unbind) {
          await remoteResponseQueues.unbind.enqueue({
            request: pdu,
            response: response as UnbindResp,
          });
        } else if (pdu.commandId === SmppCommandId.EnquireLink) {
          await remoteResponseQueues.enquireLink.enqueue({
            request: pdu,
            response: response as EnquireLinkResp,
          });
        } else if (
          (role === "esme" && pdu.commandId === SmppCommandId.SubmitSm) ||
          role === "smsc" && pdu.commandId === SmppCommandId.DeliverSm
        ) {
          await remoteResponseQueues.message.enqueue({
            request: request as PduWithContext<MessageRequest, LocalMsgCtx>,
            response: response as MessageResponse,
          });
        } else {
          throw new Error(
            [
              "Got an unknown correlation match",
              "Request:",
              JSON.stringify(request),
              "Response:",
              JSON.stringify(response),
            ].join("\n"),
          );
        }
      }
    } catch (e) {
      internalAc.abort();
      throw e;
    } finally {
      for (const q of Object.values(remoteResponseQueues)) {
        q.complete();
      }
    }
  }

  async function sendEsmeBind(request: BindRequest): Promise<BindTx> {
    return await promiseTimeout(responseTimeoutMs, async () => {
      await enqueueLocalRequest(request);

      for await (const { response } of remoteResponseQueues.bind.items()) {
        if (response.commandId !== SmppCommandId.BindTransceiverResp) {
          throw new Error(
            `Unexpected SMSC bind response command_id=${prettifySmppCommandId(response.commandId)}`,
          );
        }

        if (response.commandStatus !== SmppKnownCommandStatus.ESME_ROK) {
          throw new Error(
            `Unexpected SMSC bind response command_status=${prettifySmppCommandStatus(response.commandStatus)}`,
          );
        }

        return { request, response };
      }

      throw new Error("Expected a bind response from SMSC, instead got none");
    }, () => new Error("Timed out waiting for bind response"));
  }

  async function handleEsmeBind(
    authenticate: (request: BindRequest) => Promise<BindResponse>,
  ): Promise<BindTx> {
    return await promiseTimeout(responseTimeoutMs, async () => {
      for await (const request of remoteRequestQueue.items()) {
        if (!isPduBindRequest(request)) {
          throw new Error(
            `Expected a bind request PDU from ESME, instead got command_id=${prettifySmppCommandId(request.commandId)}`,
          );
        }

        const response = await authenticate(request);

        await outgoingQueue.enqueue(response);

        if (response.commandStatus !== SmppKnownCommandStatus.ESME_ROK) {
          throw new Error(
            `ESME failed authentication with response command_status=${
              prettifySmppCommandStatus(response.commandStatus)
            }`,
          );
        }

        return { request, response };
      }

      throw new Error(
        `Expected a bind request from ESME, instead got none`,
      );
    }, () => new Error("Timed out waiting for bind request"));
  }

  async function sendLocalUnbind() {
    const unbind: Unbind = {
      commandId: SmppCommandId.Unbind,
      commandStatus: SmppKnownCommandStatus.ESME_ROK,
      sequenceNumber: 0,
    };

    if (await enqueueLocalRequest(unbind)) {
      for await (const { response } of remoteResponseQueues.unbind.items()) {
        if (response.commandId !== SmppCommandId.UnbindResp) {
          throw new Error(
            `Unexpected unbind response commandId ${prettifySmppCommandId(response.commandId)}`,
          );
        }

        if (response.commandStatus !== SmppKnownCommandStatus.ESME_ROK) {
          throw new Error(
            `Unexpected unbind commandStatus ${prettifySmppCommandStatus(response.commandStatus)}`,
          );
        }
        break;
      }
    }
  }

  async function sendEnquireLink() {
    await delay(enquireLinkIntervalMs, {
      signal: internalSignal,
    });

    const enquireLink: EnquireLink = {
      commandId: SmppCommandId.EnquireLink,
      commandStatus: SmppKnownCommandStatus.ESME_ROK,
      sequenceNumber: 0,
    };

    return !localRequestQueue.isCompleted && await enqueueLocalRequest(enquireLink);
  }

  async function loopLocalEnquireLinks() {
    try {
      if (!await sendEnquireLink()) return;

      for await (
        const { response } of remoteResponseQueues.enquireLink.items()
      ) {
        if (response.commandId !== SmppCommandId.EnquireLinkResp) {
          throw new Error(
            `Unexpected enquire_link response commandId=${prettifySmppCommandId(response.commandId)}`,
          );
        }

        if (response.commandStatus !== SmppKnownCommandStatus.ESME_ROK) {
          throw new Error(
            `Unexpected enquire_link response commandStatus=${prettifySmppCommandStatus(response.commandStatus)}`,
          );
        }

        if (!await sendEnquireLink()) return;
      }
    } catch (e) {
      internalAc.abort();
      throw e;
    }
  }

  async function loopLocalMessageRequests(
    messageRequestQueue: AsyncReadonlyQueue<
      PduWithContext<MessageRequest, LocalMsgCtx>
    >,
  ) {
    localMessageRequestQueue = messageRequestQueue;
    try {
      for await (const { pdu, context } of localMessageRequestQueue.items()) {
        if (localRequestQueue.isCompleted || !await enqueueLocalRequest(pdu, context)) return;
      }
    } catch (e) {
      internalAc.abort();
      throw e;
    }
  }

  async function loopRemoteMessageRequests(
    handler: (request: MessageRequest) => Promise<MessageResponse>,
  ) {
    try {
      for await (const messageRequest of remoteMessageRequestQueue.items()) {
        if (
          localMessageResponsePromiseQueue.isCompleted ||
          !await localMessageResponsePromiseQueue.enqueue(handler(messageRequest))
        ) return;
      }
    } catch (e) {
      internalAc.abort();
      throw e;
    }
  }

  async function loopLocalMessageResponsePromises() {
    try {
      for await (
        const messageResponse of localMessageResponsePromiseQueue.items()
      ) {
        if (outgoingQueue.isCompleted || !await outgoingQueue.enqueue(messageResponse)) return;
      }
    } catch (e) {
      internalAc.abort();
      throw e;
    }
  }

  async function loopRemoteMessageResponses(
    handler: (
      request: PduWithContext<MessageRequest, LocalMsgCtx>,
      response: MessageResponse,
    ) => Promise<void>,
  ) {
    try {
      for await (
        const { request, response } of remoteResponseQueues.message.items()
      ) {
        await handler(request, response);
      }
    } catch (e) {
      internalAc.abort();
      throw e;
    }
  }

  async function loopExternalAbort() {
    for await (const _ of externalAbortQueue.items()) {
      try {
        return await promiseTimeout(
          responseTimeoutMs,
          () => sendLocalUnbind(),
          () =>
            new Error(
              `Unbind due to external abort signal timed out after ${responseTimeoutMs}ms`,
            ),
        );
      } finally {
        internalAc.abort();
      }
    }
  }

  async function run(
    { role, initiateBind, handle }: {
      role: "esme" | "smsc";
      initiateBind: () => Promise<BindTx>;
      handle: BindHandler;
    },
  ) {
    try {
      externalSignal.addEventListener("abort", externalAbort);
      internalSignal.addEventListener("abort", internalAbort);

      loopIncomingRaw();

      const promises = {
        connRead: connReadPromise,
        outgoing: loopOutgoing(),
        incoming: loopIncoming(),
        localRequests: loopLocalRequests(),
        localCorrelationMatches: loopLocalCorrelationMatches(role),
      };

      try {
        const bindTx = await initiateBind();

        const {
          messageRequestQueue,
          handleRemoteMessageRequest,
          handleRemoteMessageResponse,
        } = await handle(bindTx);

        return await promiseAllSettledTogether({
          externalAbort: loopExternalAbort(),
          localEnquireLinks: loopLocalEnquireLinks(),
          remoteRequests: loopRemoteRequests(role),
          localMessageRequests: loopLocalMessageRequests(messageRequestQueue),
          remoteMessageRequests: loopRemoteMessageRequests(
            handleRemoteMessageRequest,
          ),
          localMessageResponsePromises: loopLocalMessageResponsePromises(),
          remoteMessageResponses: loopRemoteMessageResponses(
            handleRemoteMessageResponse,
          ),
          ...promises,
        }, responseTimeoutMs + 2000);
      } catch (bindError) {
        internalAc.abort();
        return await promiseAllSettledTogether({
          ...promises,
          bind: Promise.reject(bindError),
        }, responseTimeoutMs + 2000);
      }
    } finally {
      internalAc.abort();
      externalSignal.removeEventListener("abort", externalAbort);
      internalSignal.removeEventListener("abort", internalAbort);
    }
  }

  const peer: RunnableSmppPeer<LocalMsgCtx> = {
    async runEsme({ bindRequest, handle }) {
      return await run({
        async initiateBind() {
          return await sendEsmeBind(bindRequest);
        },
        handle: handle as BindHandler,
        role: "esme",
      });
    },
    async runSmsc({ authenticate, handle }) {
      return await run({
        async initiateBind() {
          return await handleEsmeBind(authenticate);
        },
        handle: handle as BindHandler,
        role: "smsc",
      });
    },
  };

  return peer;
}
