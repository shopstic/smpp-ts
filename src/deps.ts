import { decode as decodeHex, encode as encodeHex } from "https://deno.land/std@0.200.0/encoding/hex.ts";
export { assertEquals, assertRejects } from "https://deno.land/std@0.200.0/assert/mod.ts";
export { writeAll } from "https://deno.land/std@0.200.0/streams/write_all.ts";
export { delay } from "https://deno.land/std@0.200.0/async/delay.ts";
export { deferred } from "https://deno.land/std@0.200.0/async/deferred.ts";
export { signal } from "https://deno.land/std@0.200.0/signal/mod.ts";
export { encodeHex };

export function encodeHexString(bytes: Uint8Array): string {
  return new TextDecoder().decode(encodeHex(bytes));
}

export function decodeHexString(hex: string): Uint8Array {
  return decodeHex(new TextEncoder().encode(hex));
}
