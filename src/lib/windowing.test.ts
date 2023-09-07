import { assertEquals, assertRejects, deferred, delay } from "../deps.ts";
import { correlateWindow } from "./windowing.ts";

type TestElement = { id: number };
const extractRequestId = (r: TestElement) => r.id;
const extractResponseId = (r: TestElement) => r.id;

Deno.test("Basic functionality", async () => {
  const lock = deferred();

  const requests = async function* () {
    yield { id: 1 };
    yield { id: 2 };
    lock.resolve();
  }();

  const responses = async function* () {
    await lock;
    yield { id: 1 };
    yield { id: 2 };
  }();

  const sendRequest = async () => {};

  const toMatch = [{ id: 1 }, { id: 2 }];
  const signal = new AbortController().signal;

  await correlateWindow<TestElement>({
    windowSize: 2,
    responseTimeoutMs: 1000,
    requests,
    responses,
    sendRequest,
    extractRequestId,
    extractResponseId,
    onMatch({ response }) {
      assertEquals(toMatch.shift(), response);
      return Promise.resolve();
    },
    signal,
  });

  // No assertion needed; we just want it to complete without error
});

Deno.test("Response timeout", async () => {
  const requests = async function* () {
    yield { id: 1 };
  }();
  const responses = async function* () {
    yield await new Promise<TestElement>(() => {});
  }();
  const sendRequest = async () => {};

  const signal = new AbortController().signal;

  await assertRejects(
    () =>
      correlateWindow({
        windowSize: 1,
        responseTimeoutMs: 100,
        requests,
        responses,
        sendRequest,
        extractRequestId,
        extractResponseId,
        onMatch() {
          throw new Error("Should not be called");
        },
        signal,
      }),
    Error,
    "Timed out after 100ms waiting for a response for the prior request with id: 1",
  );
});

Deno.test("Maximum window size enforcement", async () => {
  let inflightCount = 0;
  const requests = async function* () {
    while (true) {
      yield { id: Math.random() };
    }
  }();
  const responses = async function* () {
    yield await new Promise<TestElement>(() => {});
  }();
  const sendRequest = () => {
    inflightCount++;
    assertEquals(inflightCount <= 2, true);
    return Promise.resolve();
  };
  const abortController = new AbortController();
  const signal = abortController.signal;

  const testPromise = correlateWindow({
    windowSize: 2,
    responseTimeoutMs: 1000,
    requests,
    responses,
    sendRequest,
    extractRequestId,
    extractResponseId,
    onMatch() {
      throw new Error("Should not be called");
    },
    signal,
  });

  await delay(200);
  abortController.abort();

  assertRejects(() => testPromise, Error, "The signal has been aborted");
});

Deno.test("Response ID mismatch", async () => {
  const lock = deferred();
  const requests = async function* () {
    yield { id: 1 };
    lock.resolve();
  }();
  const responses = async function* () {
    await lock;
    yield { id: 2 };
  }();
  const sendRequest = async () => {};
  const signal = new AbortController().signal;

  await assertRejects(
    () =>
      correlateWindow({
        windowSize: 1,
        responseTimeoutMs: 1000,
        requests,
        responses,
        sendRequest,
        extractRequestId,
        extractResponseId,
        onMatch() {
          throw new Error("Should not be called");
        },
        signal,
      }),
    Error,
    `Received a response with an unrecognized id=2: {"id":2}`,
  );
});

Deno.test("Abort operation", async () => {
  const requests = async function* () {
    yield { id: 1 };
  }();
  const responses = async function* () {
    yield await new Promise<TestElement>(() => {});
  }();
  const sendRequest = async () => {};

  const abortController = new AbortController();
  const signal = abortController.signal;

  const testPromise = correlateWindow({
    windowSize: 1,
    responseTimeoutMs: 10000,
    requests,
    responses,
    sendRequest,
    extractRequestId,
    extractResponseId,
    onMatch() {
      throw new Error("Should not be called");
    },
    signal,
  });

  abortController.abort();
  await assertRejects(() => testPromise, Error, "The signal has been aborted");
});
