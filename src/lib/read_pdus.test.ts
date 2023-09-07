import { assertEquals, delay } from "../deps.ts";
import { SmppConnection } from "./common.ts";
import { readSmppPdus } from "./read_pdus.ts";

type QueueItemResolver = { resolve: (value: number | null) => void; buffer: Uint8Array };

class MockSmppConnection implements SmppConnection {
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
      resolver.resolve(null);
    }
    this.dataQueue = new Uint8Array(0);
  }

  private readFromQueue(resolver: QueueItemResolver) {
    const { resolve, buffer } = resolver;

    const availableBytes = Math.min(buffer.length, this.dataQueue.length); // Calculate how many bytes can be read
    const chunk = this.dataQueue.slice(0, availableBytes); // Slice that many bytes from the front of dataQueue

    buffer.set(chunk); // Set the chunk data to the Uint8Array (p) from read

    this.dataQueue = this.dataQueue.slice(availableBytes); // Remove the read bytes from dataQueue

    resolve(availableBytes); // Resolve the promise with the number of bytes read
  }

  async read(p: Uint8Array): Promise<number | null> {
    const promise = new Promise<number | null>((resolve) => {
      this.resolvers.push({ resolve, buffer: p });
    });

    this.flush();

    return await promise;
  }

  write(p: Uint8Array): Promise<number> {
    return Promise.resolve(p.length);
  }
}

Deno.test("Should tolerate a partial buffer of commandLength", async () => {
  const mockConn = new MockSmppConnection();

  const writePromise = (async () => {
    // First PDU
    mockConn.push(new Uint8Array([0, 0]));
    await delay(100);
    mockConn.push(new Uint8Array([0, 8]));
    await delay(100);
    mockConn.push(new Uint8Array([1, 2, 3, 4]));
    await delay(100);

    // Second PDU
    mockConn.push(new Uint8Array([0, 0, 0, 6]));
    await delay(100);
    mockConn.push(new Uint8Array([7, 8]));
    await delay(100);

    mockConn.complete();
  })();

  const readPromise = (async () => {
    const pdus = [];
    for await (const pdu of readSmppPdus(mockConn)) {
      pdus.push(pdu);
    }

    assertEquals(pdus.length, 2);
    assertEquals(pdus[0], new Uint8Array([0, 0, 0, 8, 1, 2, 3, 4]));
    assertEquals(pdus[1], new Uint8Array([0, 0, 0, 6, 7, 8]));
  })();

  await Promise.all([writePromise, readPromise]);
});

Deno.test("Should not yield incomplete PDUs", async () => {
  const mockConn = new MockSmppConnection();
  const writePromise = (async () => {
    mockConn.push(new Uint8Array([0, 0, 0, 8, 1, 2]));
    await delay(100);
    mockConn.complete();
  })();

  const readPromise = (async () => {
    for await (const _ of readSmppPdus(mockConn)) {
      throw new Error("Should not yield incomplete PDUs");
    }
  })();

  await Promise.all([writePromise, readPromise]);
});
