import { encodeHexString } from "./deps/std.ts";
import { smppCharsetDecode } from "./charset.ts";
import {
  MessageRequest,
  SmppKnownDataCoding,
  SmppSupportedCharset,
} from "./common.ts";

const defaultDcsToCharsetMap = new Map<
  SmppKnownDataCoding,
  SmppSupportedCharset
>([
  [SmppKnownDataCoding.Ia5, SmppSupportedCharset.Ascii],
  [SmppKnownDataCoding.Latin1, SmppSupportedCharset.Latin1],
  [SmppKnownDataCoding.Ucs2, SmppSupportedCharset.Ucs2],
]);

export function extractMessagePayload(pdu: MessageRequest): Uint8Array {
  const shortMessage = pdu.shortMessage;

  if (shortMessage.length > 0) {
    return shortMessage;
  }

  const messagePayload = pdu.tlvs.messagePayload;
  if (messagePayload !== undefined) {
    return messagePayload;
  }

  return new Uint8Array(0);
}

export function extractMessageContent(
  pdu: MessageRequest,
  dcsToCharsetMap: Map<SmppKnownDataCoding, SmppSupportedCharset> =
    defaultDcsToCharsetMap,
): string {
  const payload = extractMessagePayload(pdu);
  const charset = dcsToCharsetMap.get(pdu.dataCoding);

  if (charset) {
    return smppCharsetDecode(payload, charset);
  }

  return `raw(${encodeHexString(payload)})`;
}
