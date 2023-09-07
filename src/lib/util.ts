export function withTimeout<T>(name: string, timeoutMs: number, fn: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${name} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fn().then(resolve, reject).finally(() => {
      clearTimeout(timeout);
    });
  });
}
