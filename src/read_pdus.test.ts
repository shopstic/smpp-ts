import { deferred, delay } from "./deps/std.ts";
import { assertEquals } from "./deps/std_test.ts";
import { readSmppPdus } from "./read_pdus.ts";

type QueueItemResolver = {
  resolve: (value: ReadableStreamBYOBReadResult<ArrayBufferView>) => void;
  buffer: ArrayBufferView;
};

class MockReader implements ReadableStreamBYOBReader {
  readonly closed = deferred<void>();
  // deno-lint-ignore no-explicit-any
  cancel(_reason?: any) {
    return Promise.reject(new Error("Not implemented"));
  }

  releaseLock() {
    throw new Error("Not implemented");
  }

  private dataQueue: Uint8Array = new Uint8Array(0);
  private resolvers: QueueItemResolver[] = [];

  flush() {
    while (this.resolvers.length > 0 && this.dataQueue.length > 0) {
      const resolver = this.resolvers.shift()!;
      this.readFromQueue(resolver);
    }
  }

  push(chunk: Uint8Array) {
    const newData = new Uint8Array(this.dataQueue.length + chunk.length);
    newData.set(this.dataQueue);
    newData.set(chunk, this.dataQueue.length);
    this.dataQueue = newData;
    this.flush();
  }

  complete() {
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()!;
      resolver.resolve({ done: true });
    }
    this.dataQueue = new Uint8Array(0);
  }

  private readFromQueue(resolver: QueueItemResolver) {
    const { resolve, buffer } = resolver;

    const availableBytes = Math.min(buffer.byteLength, this.dataQueue.length); // Calculate how many bytes can be read
    const chunk = this.dataQueue.slice(0, availableBytes); // Slice that many bytes from the front of dataQueue

    (buffer as Uint8Array).set(chunk); // Set the chunk data to the Uint8Array (p) from read

    this.dataQueue = this.dataQueue.slice(availableBytes); // Remove the read bytes from dataQueue

    resolve({ value: new Uint8Array(buffer.buffer, buffer.byteOffset, chunk.byteLength), done: false }); // Resolve the promise with the number of bytes read
  }

  async read<V extends ArrayBufferView>(
    buffer: ArrayBufferView,
  ): Promise<ReadableStreamBYOBReadResult<V>> {
    const promise = new Promise<ReadableStreamBYOBReadResult<V>>((resolve) => {
      // deno-lint-ignore no-explicit-any
      this.resolvers.push({ resolve: resolve as any, buffer });
    });

    this.flush();

    return await promise;
  }
}

Deno.test("Should tolerate a partial buffer of commandLength", async () => {
  const mockReader = new MockReader();

  const writePromise = (async () => {
    // First PDU
    mockReader.push(new Uint8Array([0, 0]));
    await delay(100);
    mockReader.push(new Uint8Array([0, 8]));
    await delay(100);
    mockReader.push(new Uint8Array([1, 2, 3, 4]));
    await delay(100);

    // Second PDU
    mockReader.push(new Uint8Array([0, 0, 0, 6]));
    await delay(100);
    mockReader.push(new Uint8Array([7, 8]));
    await delay(100);

    mockReader.complete();
  })();

  const readPromise = (async () => {
    const pdus = [];
    for await (const pdu of readSmppPdus(mockReader)) {
      pdus.push(pdu);
    }

    assertEquals(pdus.length, 2);
    assertEquals(pdus[0], new Uint8Array([0, 0, 0, 8, 1, 2, 3, 4]));
    assertEquals(pdus[1], new Uint8Array([0, 0, 0, 6, 7, 8]));
  })();

  await Promise.all([writePromise, readPromise]);
});

Deno.test("Should not yield incomplete PDUs", async () => {
  const mockReader = new MockReader();
  const writePromise = (async () => {
    mockReader.push(new Uint8Array([0, 0, 0, 8, 1, 2]));
    await delay(100);
    mockReader.complete();
  })();

  const readPromise = (async () => {
    for await (const _ of readSmppPdus(mockReader)) {
      throw new Error("Should not yield incomplete PDUs");
    }
  })();

  await Promise.all([writePromise, readPromise]);
});
