import { deferred } from "../deps.ts";
import { Pdu } from "./common.ts";

class Semaphore {
  private tasks: (() => void)[] = [];
  count: number;

  constructor(count: number) {
    this.count = count;
  }

  acquire() {
    return new Promise<void>((resolve) => {
      const task = () => {
        this.count--;
        resolve();
      };

      if (this.count > 0) {
        task();
      } else {
        this.tasks.push(task);
      }
    });
  }

  release() {
    if (this.tasks.length > 0) {
      const next = this.tasks.shift();
      if (next) {
        next();
      }
    } else {
      this.count++;
    }
  }
}

type InflightRequest<T> = {
  request: T;
  timer: number;
};

export interface WindowCorrelationMatch<Req, Res, Id> {
  id: Id;
  request: Req;
  response: Res;
}

export async function correlateWindow<Req, Res = Req, Id = number>(
  {
    windowSize,
    responseTimeoutMs,
    requests,
    responses,
    sendRequest,
    extractRequestId,
    extractResponseId,
    onMatch,
    signal,
  }: {
    windowSize: number;
    responseTimeoutMs: number;
    requests: AsyncGenerator<Req>;
    responses: AsyncGenerator<Res>;
    sendRequest: (request: Req) => Promise<void>;
    extractRequestId: (element: Req) => Id;
    extractResponseId: (element: Res) => Id;
    onMatch: (match: WindowCorrelationMatch<Req, Res, Id>) => Promise<void>;
    signal: AbortSignal;
  },
): Promise<void> {
  const inflightRequests = new Map<Id, InflightRequest<Req>>();
  const semaphore = new Semaphore(windowSize);

  const abortionDeferred = deferred();
  const abortController = new AbortController();

  function abort(error: Error) {
    abortController.abort(error);
    abortionDeferred.reject(error);
  }

  const onExternalAbort = (event: Event) => {
    const target = event.target;
    const error = target && "reason" in target ? target.reason as Error : new Error("Operation was aborted");
    abort(error);
  };

  signal.addEventListener("abort", onExternalAbort);

  if (signal.aborted) {
    abort(new Error("Operation was aborted"));
  }

  function cleanup() {
    signal.removeEventListener("abort", onExternalAbort);
    for (const { timer } of inflightRequests.values()) {
      clearTimeout(timer);
    }
    inflightRequests.clear();
  }

  const processResponses = async () => {
    for await (const response of responses) {
      if (abortController.signal.aborted) {
        throw new Error("Operation was aborted");
      }

      const id = extractResponseId(response);

      if (inflightRequests.has(id)) {
        const inflight = inflightRequests.get(id);
        clearTimeout(inflight!.timer);
        inflightRequests.delete(id);
        semaphore.release();
        await onMatch({
          id,
          request: inflight!.request,
          response,
        });
      } else {
        throw new Error(`Received a response with an unrecognized id=${id}: ${JSON.stringify(response)}`);
      }
    }

    if (inflightRequests.size > 0) {
      throw new Error(`Responses completed but there are still ${inflightRequests.size} requests in flight`);
    }
  };

  const processRequests = async () => {
    for await (const request of requests) {
      if (abortController.signal.aborted) {
        throw new Error("Operation was aborted");
      }

      await semaphore.acquire();

      const id = extractRequestId(request);

      const timer = setTimeout(() => {
        inflightRequests.delete(id);
        semaphore.release();
        abort(
          new Error(
            `Timed out after ${responseTimeoutMs}ms waiting for a response for the prior request with id: ${id}`,
          ),
        );
      }, responseTimeoutMs);

      inflightRequests.set(id, {
        request,
        timer,
      });

      await sendRequest(request);
    }
  };

  try {
    await Promise.race([
      Promise.all([
        processResponses(),
        processRequests(),
      ]),
      abortionDeferred,
    ]);
  } finally {
    cleanup();
  }
}

export type PduCorrelationMatch = WindowCorrelationMatch<Pdu, Pdu, number>;

export function correlatePduWindow(params: {
  windowSize: number;
  responseTimeoutMs: number;
  requests: AsyncGenerator<Pdu>;
  responses: AsyncGenerator<Pdu>;
  sendRequest: (request: Pdu) => Promise<void>;
  onMatch: (match: PduCorrelationMatch) => Promise<void>;
  signal: AbortSignal;
}) {
  return correlateWindow<Pdu>({
    ...params,
    extractRequestId: (pdu) => pdu.sequenceNumber,
    extractResponseId: (pdu) => pdu.sequenceNumber,
  });
}
