import { Buffer } from "node:buffer";
import { SmppSupportedCharset } from "./common.ts";

export function smppCharsetEncode(str: string, charset: SmppSupportedCharset): Uint8Array {
  switch (charset) {
    case "ascii":
      return Buffer.from(str, "ascii");
    case "latin1":
      return Buffer.from(str, "latin1");
    case "ucs2":
      return Buffer.from(str, "ucs2").swap16();
    default:
      throw new Error("Does not yet support encoding in charset " + charset);
  }
}

export function smppCharsetDecode(buf: Uint8Array, charset: SmppSupportedCharset): string {
  switch (charset) {
    case "ascii":
      return new TextDecoder("ascii").decode(buf);
    case "latin1":
      return new TextDecoder("latin1").decode(buf);
    case "ucs2":
      return new TextDecoder("utf-16be").decode(buf);
    default:
      throw new Error("Does not yet support decoding in charset " + charset);
  }
}
