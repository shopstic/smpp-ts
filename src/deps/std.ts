import { decode as decodeHex, encode as encodeHex } from "https://deno.land/std@0.205.0/encoding/hex.ts";
export * from "https://deno.land/std@0.205.0/assert/mod.ts";
export { parse as parseDate } from "https://deno.land/std@0.205.0/datetime/parse.ts";
export { writeAll } from "https://deno.land/std@0.205.0/streams/write_all.ts";
export { delay } from "https://deno.land/std@0.205.0/async/delay.ts";
export { type Deferred, deferred } from "https://deno.land/std@0.205.0/async/deferred.ts";
export { chunk } from "https://deno.land/std@0.205.0/collections/chunk.ts";
export { slidingWindows } from "https://deno.land/std@0.205.0/collections/sliding_windows.ts";
export { signal as OsSignal } from "https://deno.land/std@0.205.0/signal/mod.ts";

export { encodeHex };

export function encodeHexString(bytes: Uint8Array): string {
  return new TextDecoder().decode(encodeHex(bytes));
}

export function decodeHexString(hex: string): Uint8Array {
  return decodeHex(new TextEncoder().encode(hex));
}
