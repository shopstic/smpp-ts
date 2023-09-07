export class AsyncQueue<T> {
  private buffer: T[] = [];
  private resolveQueue: (() => void)[] = [];
  private yieldQueue: (() => void)[] = [];
  public isCompleted = false;

  enqueue(value: T): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.isCompleted) {
        throw new Error("The queue is completed. No more items can be enqueued.");
      }

      if (this.buffer.length < this.maxBufferSize) {
        this.buffer.push(value);
        resolve();

        // If there are any pending yield operations, fulfill one
        if (this.yieldQueue.length > 0) {
          const yieldResolve = this.yieldQueue.shift();
          yieldResolve!();
        }
      } else {
        // If the buffer is full, wait for it to have space
        this.resolveQueue.push(() => {
          this.buffer.push(value);
          resolve();
        });
      }
    });
  }

  complete(): void {
    this.isCompleted = true;
    for (const resolve of this.yieldQueue) {
      resolve();
    }
  }

  map<U>(fn: (value: T) => U): AsyncQueue<U> {
    const mappedQueue = new AsyncQueue<U>(this.maxBufferSize);

    (async () => {
      for await (const item of this.items()) {
        if (mappedQueue.isCompleted) {
          return;
        }
        const mappedItem = fn(item);
        await mappedQueue.enqueue(mappedItem);
      }

      mappedQueue.complete();
    })();

    return mappedQueue;
  }

  async *items(): AsyncGenerator<T> {
    while (true) {
      if (this.isCompleted) {
        return;
      }

      if (this.buffer.length > 0) {
        const value = this.buffer.shift();

        // If there are any pending enqueue operations, fulfill one
        if (this.resolveQueue.length > 0) {
          const enqueueResolve = this.resolveQueue.shift();
          enqueueResolve!();
        }

        yield value as T;
      } else {
        // If the buffer is empty, wait for it to have data
        await new Promise<void>((resolve) => {
          this.yieldQueue.push(resolve);
        });
      }
    }
  }

  constructor(private maxBufferSize: number) {
  }
}
