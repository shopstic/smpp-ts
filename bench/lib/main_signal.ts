import { Logger } from "../deps.ts";

export function createMainSignal(logger: Logger) {
  const abortController = new AbortController();
  const signal = abortController.signal;

  (["SIGTERM", "SIGINT"] as const).forEach((signal) => {
    const cb = () => {
      logger.info?.("got signal", signal);
      abortController.abort();
      Deno.removeSignalListener(signal, cb);
    };
    Deno.addSignalListener(signal, cb);
  });

  return { abortController, signal };
}
