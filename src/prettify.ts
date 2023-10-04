import { Table } from "./deps/cliffy.ts";
import { encodeHexString } from "./deps/std.ts";
import { smppCharsetDecode } from "./charset.ts";
import { SmppKnownCommandStatus } from "./command_status.ts";
import {
  BindRequestKeys,
  BindResponseKeys,
  isPduBindRequest,
  isPduBindResponse,
  isPduMessageRequest,
  isPduMessageResponse,
  MessageRequestKeys,
  MessageResponseKeys,
  SmppBasePduKeys,
  SmppCommandId,
  SmppKnownDataCoding,
  SmppNpi,
  SmppPdu,
  SmppSupportedCharset,
  SmppTon,
} from "./common.ts";
import {
  SmppEsmClass,
  SmppFeature,
  SmppMessageType,
  SmppMessagingMode,
} from "./esm_class.ts";
import { SmppMessageState } from "./message_state.ts";
import {
  SmppIntermediateNotification,
  SmppRegisteredDelivery,
  SmppSmeAcknowledgement,
  SmppSmscDelivery,
} from "./registered_delivery.ts";
import { SmppKnownTlvTag, SmppTlvs } from "./tlv.ts";

function memoize<T>(fn: () => T) {
  let value: T;
  return () => {
    if (value === undefined) {
      value = fn();
    }
    return value;
  };
}

const getSmppKnownCommandStatusByValueMap = memoize(() =>
  new Map(
    Array.from(Object.entries(SmppKnownCommandStatus)).map(([k, v]) => [v, k]),
  )
);

const getSmppCommandIdByValueMap = memoize(() =>
  new Map(Array.from(Object.entries(SmppCommandId)).map(([k, v]) => [v, k]))
);

const getSmppTonByValueMap = memoize(() =>
  new Map(Array.from(Object.entries(SmppTon)).map(([k, v]) => [v, k]))
);

const getSmppNpiByValueMap = memoize(() =>
  new Map(Array.from(Object.entries(SmppNpi)).map(([k, v]) => [v, k]))
);

const getSmppTlvTagByValueMap = memoize(() =>
  new Map(Array.from(Object.entries(SmppKnownTlvTag)).map(([k, v]) => [v, k]))
);

const getSmppMessagingModeByValueMap = memoize(() =>
  new Map(Array.from(Object.entries(SmppMessagingMode)).map(([k, v]) => [v, k]))
);
const getSmppMessageTypeByValueMap = memoize(() =>
  new Map(Array.from(Object.entries(SmppMessageType)).map(([k, v]) => [v, k]))
);
const getSmppFeatureByValueMap = memoize(() =>
  new Map(Array.from(Object.entries(SmppFeature)).map(([k, v]) => [v, k]))
);

const getSmppSmscDeliveryByValueMap = memoize(() =>
  new Map(Array.from(Object.entries(SmppSmscDelivery)).map(([k, v]) => [v, k]))
);

const getSmppSmeAcknowledgementByValueMap = memoize(() =>
  new Map(
    Array.from(Object.entries(SmppSmeAcknowledgement)).map(([k, v]) => [v, k]),
  )
);

const getSmppIntermediateNotificationByValueMap = memoize(() =>
  new Map(
    Array.from(Object.entries(SmppIntermediateNotification)).map((
      [k, v],
    ) => [v, k]),
  )
);
const getSmppKnownDataCodingByValueMap = memoize(() =>
  new Map(
    Array.from(Object.entries(SmppKnownDataCoding)).map(([k, v]) => [v, k]),
  )
);
const getSmppMessageStateByValueMap = memoize(() =>
  new Map(Array.from(Object.entries(SmppMessageState)).map(([k, v]) => [v, k]))
);

export function prettifySmppDataCoding(dataCoding: number): string {
  return getSmppKnownDataCodingByValueMap().get(dataCoding) ??
    `Unknown(${dataCoding})`;
}

export function prettifySmppCommandId(commandId: number): string {
  return getSmppCommandIdByValueMap().get(commandId) ??
    `Unknown(${commandId.toString(16)})`;
}

export function prettifySmppCommandStatus(commandStatus: number): string {
  return getSmppKnownCommandStatusByValueMap().get(commandStatus) ??
    `Unknown(${commandStatus.toString(16)})`;
}

export function prettifySmppTon(ton: number): string {
  return getSmppTonByValueMap().get(ton) ?? `Unknown(${ton.toString(16)})`;
}

export function prettifySmppNpi(npi: number): string {
  return getSmppNpiByValueMap().get(npi) ?? `Unknown(${npi.toString(16)})`;
}

export function prettifySmppTlvTag(tag: number): string {
  return getSmppTlvTagByValueMap().get(tag) ?? `Unknown(${tag.toString(16)})`;
}

export function prettifySmppMessageState(messageState: number): string {
  return getSmppMessageStateByValueMap().get(messageState) ??
    `Unknown(${messageState})`;
}

export function prettifySmppTlvs(tlvs: SmppTlvs): string {
  const items: string[] = [];

  for (const [tag, value] of tlvs.map) {
    const prettifiedTag = prettifySmppTlvTag(tag);

    let prettifiedValue: string;

    if (value instanceof Uint8Array) {
      prettifiedValue = encodeHexString(value);
    } else if (typeof value === "object") {
      prettifiedValue = JSON.stringify(value);
    } else if (
      tag === SmppKnownTlvTag.MessageState && typeof value === "number"
    ) {
      prettifiedValue = prettifySmppMessageState(value);
    } else {
      prettifiedValue = String(value);
    }

    items.push(`${prettifiedTag}=${prettifiedValue}`);
  }

  return items.join(", ");
}

export function prettifySmppEsmClass(esmClass: SmppEsmClass) {
  const messagingMode =
    getSmppMessagingModeByValueMap().get(esmClass.messagingMode) ?? "unknown";
  const messageType =
    getSmppMessageTypeByValueMap().get(esmClass.messageType) ?? "unknown";
  const features = Array.from(esmClass.features).map((feature) =>
    getSmppFeatureByValueMap().get(feature) ?? "unknown"
  );

  return `mode=${messagingMode} type=${messageType} features=${
    features.join(",")
  }`;
}

export function prettifySmppRegisteredDelivery(
  registeredDelivery: SmppRegisteredDelivery,
) {
  const smscDelivery =
    getSmppSmscDeliveryByValueMap().get(registeredDelivery.smscDelivery) ??
      "unknown";
  const smeAcknowledgement =
    getSmppSmeAcknowledgementByValueMap().get(
      registeredDelivery.smeAcknowledgement,
    ) ??
      "unknown";
  const intermediateNotification =
    getSmppIntermediateNotificationByValueMap().get(
      registeredDelivery.intermediateNotification,
    ) ?? "unknown";

  return `smsc=${smscDelivery} sme=${smeAcknowledgement} intermediate=${intermediateNotification}`;
}

const defaultDcsToCharsetMap = new Map<
  SmppKnownDataCoding,
  SmppSupportedCharset
>([
  [SmppKnownDataCoding.SmscDefaultAlphabet, SmppSupportedCharset.Ascii],
  [SmppKnownDataCoding.Ia5, SmppSupportedCharset.Ascii],
  [SmppKnownDataCoding.Ucs2, SmppSupportedCharset.Ucs2],
  [SmppKnownDataCoding.Latin1, SmppSupportedCharset.Latin1],
]);

export function prettifySmppPdu(
  pdu: SmppPdu,
  dcsToCharsetMap: Map<SmppKnownDataCoding, SmppSupportedCharset> =
    defaultDcsToCharsetMap,
) {
  const base = {
    commandId: prettifySmppCommandId(pdu.commandId),
    commandStatus: prettifySmppCommandStatus(pdu.commandStatus),
  };

  if (isPduBindRequest(pdu)) {
    return {
      ...pdu,
      ...base,
      addrTon: prettifySmppTon(pdu.addrTon),
      addrNpi: prettifySmppNpi(pdu.addrNpi),
    };
  }

  if (isPduBindResponse(pdu)) {
    return {
      ...pdu,
      ...base,
      tlvs: prettifySmppTlvs(pdu.tlvs),
    };
  }

  if (isPduMessageRequest(pdu)) {
    const charset = dcsToCharsetMap?.get(pdu.dataCoding);
    const shortMessage = charset
      ? smppCharsetDecode(pdu.shortMessage, charset)
      : `raw(${encodeHexString(pdu.shortMessage)})`;

    return {
      ...pdu,
      ...base,
      sourceAddrTon: prettifySmppTon(pdu.sourceAddrTon),
      sourceAddrNpi: prettifySmppNpi(pdu.sourceAddrNpi),
      destAddrTon: prettifySmppTon(pdu.destAddrTon),
      destAddrNpi: prettifySmppNpi(pdu.destAddrNpi),
      esmClass: prettifySmppEsmClass(pdu.esmClass),
      registeredDelivery: prettifySmppRegisteredDelivery(
        pdu.registeredDelivery,
      ),
      dataCoding: prettifySmppDataCoding(pdu.dataCoding),
      shortMessage,
      tlvs: prettifySmppTlvs(pdu.tlvs),
    };
  }

  if (isPduMessageResponse(pdu)) {
    return {
      ...pdu,
      ...base,
      tlvs: prettifySmppTlvs(pdu.tlvs),
    };
  }

  return {
    ...pdu,
    ...base,
  };
}

function getPduKeys(pdu: SmppPdu): string[] {
  if (isPduBindRequest(pdu)) {
    return BindRequestKeys;
  }

  if (isPduBindResponse(pdu)) {
    return BindResponseKeys;
  }

  if (isPduMessageRequest(pdu)) {
    return MessageRequestKeys;
  }

  if (isPduMessageResponse(pdu)) {
    return MessageResponseKeys;
  }

  return SmppBasePduKeys;
}

export function renderSmppPduAsTable<T extends SmppPdu>(
  pdu: T,
  dcsToCharsetMap: Map<SmppKnownDataCoding, SmppSupportedCharset> =
    defaultDcsToCharsetMap,
) {
  const prettified = prettifySmppPdu(pdu, dcsToCharsetMap);
  const allKeys = getPduKeys(pdu);
  const header: string[] = [];
  const rows: string[] = [];

  for (const key of allKeys) {
    if (key !== "commandLength") {
      // deno-lint-ignore no-explicit-any
      const value = String((prettified as any)[key]);
      if (value.length > 0) {
        header.push(key);
        rows.push(value);
      }
    }
  }

  return Table
    .from([rows])
    .header(header)
    .border()
    .toString();
}

export function prettifySmppPdusAsTable<T extends SmppPdu>(
  pdus: T[],
  dcsToCharsetMap: Map<SmppKnownDataCoding, SmppSupportedCharset> =
    defaultDcsToCharsetMap,
) {
  if (pdus.length === 0) {
    return "";
  }

  const head = pdus[0];
  const header = getPduKeys(head).slice(1); // Remove commandLength
  const rows = pdus.map((pdu) => {
    const prettified = prettifySmppPdu(pdu, dcsToCharsetMap);
    // deno-lint-ignore no-explicit-any
    return header.map((key) => String((prettified as any)[key]));
  });

  return Table
    .from(rows)
    .header(header)
    .border()
    .toString();
}
