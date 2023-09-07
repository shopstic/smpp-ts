import { assertEquals, assertRejects } from "../deps.ts";
import { AsyncQueue } from "./async_queue.ts";

Deno.test("Should be able to enqueue and consume items", async () => {
  const queue = new AsyncQueue<number>(2);

  await queue.enqueue(1);
  await queue.enqueue(2);

  const results: number[] = [];

  for await (const item of queue.items()) {
    results.push(item);
    if (results.length === 2) {
      queue.complete();
    }
  }

  assertEquals(results, [1, 2]);
});

Deno.test("Should enforce buffer limit", async () => {
  const queue = new AsyncQueue<number>(1);

  await queue.enqueue(1);

  let isSecondEnqueueDone = false;
  queue.enqueue(2).then(() => {
    isSecondEnqueueDone = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 500));

  assertEquals(isSecondEnqueueDone, false, "Second enqueue should not be done yet");

  queue.complete();
});

Deno.test("Should stop generator after calling complete", async () => {
  const queue = new AsyncQueue<number>(2);

  await queue.enqueue(1);
  await queue.enqueue(2);

  const results: number[] = [];

  queue.complete();

  for await (const item of queue.items()) {
    results.push(item);
  }

  assertEquals(results, []);
});

Deno.test("Should throw error if enqueue is called after complete", async () => {
  const queue = new AsyncQueue<number>(2);

  queue.complete();

  await assertRejects(
    async () => {
      await queue.enqueue(1);
    },
    Error,
    "The queue is completed. No more items can be enqueued.",
  );
});
