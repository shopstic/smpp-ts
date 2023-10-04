import { SmppEsmClass } from "./esm_class.ts";
import { SmppRegisteredDelivery } from "./registered_delivery.ts";
import { SmppTlvs } from "./tlv.ts";

export enum SmppCommandId {
  GenericNack = 0x80000000,
  BindReceiver = 0x00000001,
  BindReceiverResp = 0x80000001,
  BindTransmitter = 0x00000002,
  BindTransmitterResp = 0x80000002,
  QuerySm = 0x00000003,
  QuerySmResp = 0x80000003,
  SubmitSm = 0x00000004,
  SubmitSmResp = 0x80000004,
  DeliverSm = 0x00000005,
  DeliverSmResp = 0x80000005,
  Unbind = 0x00000006,
  UnbindResp = 0x80000006,
  ReplaceSm = 0x00000007,
  ReplaceSmResp = 0x80000007,
  CancelSm = 0x00000008,
  CancelSmResp = 0x80000008,
  BindTransceiver = 0x00000009,
  BindTransceiverResp = 0x80000009,
  Outbind = 0x0000000B,
  EnquireLink = 0x00000015,
  EnquireLinkResp = 0x80000015,
  SubmitMulti = 0x00000021,
  SubmitMultiResp = 0x80000021,
  AlertNotification = 0x00000102,
  DataSm = 0x00000103,
  DataSmResp = 0x80000103,
}

export enum SmppTon {
  Unknown = 0x00,
  International = 0x01,
  National = 0x02,
  NationalSpecific = 0x03,
  SubscriberNumber = 0x04,
  Alphanumeric = 0x05,
  Abbreviated = 0x06,
}

export enum SmppNpi {
  Unknown = 0x00,
  E164 = 0x01,
  Data = 0x03,
  Telex = 0x04,
  LandMobile = 0x06,
  National = 0x08,
  Private = 0x09,
  ERMES = 0x10,
  Internet = 0x14,
  WapClientId = 0x18,
}

export enum SmppKnownDataCoding {
  SmscDefaultAlphabet = 0,
  Ia5 = 1,
  OctetUnspecified = 2,
  Latin1 = 3,
  OctetUnspecified2 = 4,
  Jis = 5, // X 0208-1990
  Cyrillic = 6, // ISO-8859-5
  LatinHebrew = 7, // ISO-8859-8
  Ucs2 = 8, // ISO/IEC-10646
  PictogramEncoding = 9,
  MusicCodes = 10,
  ExtendedKanjiJis = 13, // X 0212-1990)
  KsC5601 = 14,
}

export enum SmppSupportedCharset {
  Ascii = "ascii",
  Ucs2 = "ucs2",
  Latin1 = "latin1",
  Cyrillic = "iso88595",
  LatinHebrew = "iso88598",
}

export type WithCommandLength<T> = T & {
  commandLength: number;
};

export interface SmppBasePdu {
  commandId: SmppCommandId;
  commandStatus: number;
  sequenceNumber: number;
}

export const SmppBasePduKeys: Array<keyof SmppBasePdu | "commandLength"> = [
  "commandLength",
  "commandId",
  "commandStatus",
  "sequenceNumber",
];

export interface SmppTlv {
  tag: number;
  value: Uint8Array;
}

export interface BindRequest extends SmppBasePdu {
  commandId: SmppCommandId.BindTransmitter | SmppCommandId.BindReceiver | SmppCommandId.BindTransceiver;
  systemId: string;
  password: string;
  systemType: string;
  interfaceVersion: number;
  addrTon: SmppTon;
  addrNpi: SmppNpi;
  addressRange: string;
}

export const BindRequestKeys: Array<keyof BindRequest | "commandLength"> = [
  "commandLength",
  "commandId",
  "commandStatus",
  "sequenceNumber",
  "systemId",
  "password",
  "systemType",
  "interfaceVersion",
  "addrTon",
  "addrNpi",
  "addressRange",
];

export interface BindResponse extends SmppBasePdu {
  commandId: SmppCommandId.BindTransmitterResp | SmppCommandId.BindReceiverResp | SmppCommandId.BindTransceiverResp;
  systemId: string;
  tlvs: SmppTlvs;
}

export const BindResponseKeys: Array<keyof BindResponse | "commandLength"> = [
  "commandLength",
  "commandId",
  "commandStatus",
  "sequenceNumber",
  "systemId",
  "tlvs",
];

export interface MessageRequest extends SmppBasePdu {
  commandId: SmppCommandId.SubmitSm | SmppCommandId.DeliverSm;
  serviceType: string;
  sourceAddrTon: SmppTon;
  sourceAddrNpi: SmppNpi;
  sourceAddr: string;
  destAddrTon: SmppTon;
  destAddrNpi: SmppNpi;
  destinationAddr: string;
  esmClass: SmppEsmClass;
  protocolId: number;
  priorityFlag: number;
  scheduleDeliveryTime: string;
  validityPeriod: string;
  registeredDelivery: SmppRegisteredDelivery;
  replaceIfPresentFlag: number;
  dataCoding: number;
  smDefaultMsgId: number;
  smLength: number;
  shortMessage: Uint8Array;
  tlvs: SmppTlvs;
}

export const MessageRequestKeys: Array<keyof MessageRequest | "commandLength"> = [
  "commandLength",
  "commandId",
  "commandStatus",
  "sequenceNumber",
  "serviceType",
  "sourceAddrTon",
  "sourceAddrNpi",
  "sourceAddr",
  "destAddrTon",
  "destAddrNpi",
  "destinationAddr",
  "esmClass",
  "protocolId",
  "priorityFlag",
  "scheduleDeliveryTime",
  "validityPeriod",
  "registeredDelivery",
  "replaceIfPresentFlag",
  "dataCoding",
  "smDefaultMsgId",
  "smLength",
  "shortMessage",
  "tlvs",
];

export interface MessageResponse extends SmppBasePdu {
  commandId: SmppCommandId.SubmitSmResp | SmppCommandId.DeliverSmResp;
  messageId: string;
  tlvs: SmppTlvs;
}

export const MessageResponseKeys: Array<keyof MessageResponse | "commandLength"> = [
  "commandLength",
  "commandId",
  "commandStatus",
  "sequenceNumber",
  "messageId",
  "tlvs",
];

export type BindTransmitter = BindRequest & {
  commandId: SmppCommandId.BindTransmitter;
};
export type BindReceiver = BindRequest & {
  commandId: SmppCommandId.BindReceiver;
};
export type BindTransceiver = BindRequest & {
  commandId: SmppCommandId.BindTransceiver;
};
export type BindTransmitterResp = BindResponse & {
  commandId: SmppCommandId.BindTransmitterResp;
};
export type BindReceiverResp = BindResponse & {
  commandId: SmppCommandId.BindReceiverResp;
};
export type BindTransceiverResp = BindResponse & {
  commandId: SmppCommandId.BindTransceiverResp;
};
export type Unbind = SmppBasePdu & {
  commandId: SmppCommandId.Unbind;
};
export type UnbindResp = SmppBasePdu & {
  commandId: SmppCommandId.UnbindResp;
};
export type SubmitSm = MessageRequest & {
  commandId: SmppCommandId.SubmitSm;
};
export type SubmitSmResp = MessageResponse & {
  commandId: SmppCommandId.SubmitSmResp;
};
export type DeliverSm = MessageRequest & {
  commandId: SmppCommandId.DeliverSm;
};
export type DeliverSmResp = MessageResponse & {
  commandId: SmppCommandId.DeliverSmResp;
};
export type EnquireLink = SmppBasePdu & {
  commandId: SmppCommandId.EnquireLink;
};
export type EnquireLinkResp = SmppBasePdu & {
  commandId: SmppCommandId.EnquireLinkResp;
};
export type GenericNack = SmppBasePdu & {
  commandId: SmppCommandId.GenericNack;
};

export type SmppPdu =
  | BindTransmitter
  | BindReceiver
  | BindTransceiver
  | BindTransmitterResp
  | BindReceiverResp
  | BindTransceiverResp
  | Unbind
  | UnbindResp
  | SubmitSm
  | SubmitSmResp
  | DeliverSm
  | DeliverSmResp
  | EnquireLink
  | EnquireLinkResp
  | GenericNack;

export type HexFormOf<T> = {
  [K in keyof T]-?: string;
};

export interface SmppConnection {
  read(p: Uint8Array): Promise<number | null>;
  write(p: Uint8Array): Promise<number>;
}

export function isCommandIdBindRequest(commandId: SmppCommandId): commandId is BindRequest["commandId"] {
  return commandId === SmppCommandId.BindTransmitter ||
    commandId === SmppCommandId.BindReceiver ||
    commandId === SmppCommandId.BindTransceiver;
}

export function isCommandIdBindResponse(commandId: SmppCommandId): commandId is BindResponse["commandId"] {
  return commandId === SmppCommandId.BindTransmitterResp ||
    commandId === SmppCommandId.BindReceiverResp ||
    commandId === SmppCommandId.BindTransceiverResp;
}

export function isCommandIdMessageRequest(commandId: SmppCommandId): commandId is MessageRequest["commandId"] {
  return commandId === SmppCommandId.SubmitSm ||
    commandId === SmppCommandId.DeliverSm;
}

export function isCommandIdMessageResponse(commandId: SmppCommandId): commandId is MessageResponse["commandId"] {
  return commandId === SmppCommandId.SubmitSmResp ||
    commandId === SmppCommandId.DeliverSmResp;
}

export function isPduBindRequest(pdu: SmppPdu): pdu is BindRequest {
  return isCommandIdBindRequest(pdu.commandId);
}

export function isPduBindResponse(pdu: SmppPdu): pdu is BindResponse {
  return isCommandIdBindResponse(pdu.commandId);
}

export function isPduMessageRequest(pdu: SmppPdu): pdu is MessageRequest {
  return isCommandIdMessageRequest(pdu.commandId);
}

export function isPduMessageResponse(pdu: SmppPdu): pdu is MessageResponse {
  return isCommandIdMessageResponse(pdu.commandId);
}

export function isPduRequest(pdu: SmppPdu) {
  const commandId = pdu.commandId;

  switch (commandId) {
    case SmppCommandId.Unbind:
    case SmppCommandId.SubmitSm:
    case SmppCommandId.DeliverSm:
    case SmppCommandId.EnquireLink:
      return true;
    default:
      return isPduBindRequest(pdu);
  }
}

export function isPduResponse(pdu: SmppPdu) {
  const commandId = pdu.commandId;

  switch (commandId) {
    case SmppCommandId.BindTransmitterResp:
    case SmppCommandId.BindReceiverResp:
    case SmppCommandId.BindTransceiverResp:
    case SmppCommandId.UnbindResp:
    case SmppCommandId.SubmitSmResp:
    case SmppCommandId.DeliverSmResp:
    case SmppCommandId.EnquireLinkResp:
    case SmppCommandId.GenericNack:
      return true;
    default:
      return false;
  }
}

export function getBindResponseCommandId(requestCommandId: BindRequest["commandId"]): BindResponse["commandId"] {
  if (requestCommandId === SmppCommandId.BindTransceiver) {
    return SmppCommandId.BindTransceiverResp;
  }

  if (requestCommandId === SmppCommandId.BindReceiver) {
    return SmppCommandId.BindReceiverResp;
  }

  return SmppCommandId.BindTransmitterResp;
}

function memoize<T>(fn: () => T) {
  let value: T;
  return () => {
    if (value === undefined) {
      value = fn();
    }
    return value;
  };
}

export const getSmppCommandIdValueSet = memoize(() => new Set(Object.values(SmppCommandId)));

export const getSmppTonValueSet = memoize(() => new Set(Object.values(SmppTon)));

export const getSmppNpiValueSet = memoize(() => new Set(Object.values(SmppNpi)));

export function toSmppTon(value: number): SmppTon {
  if (!getSmppTonValueSet().has(value)) {
    throw new Error(`Unknown ton value: ${value.toString(16)}`);
  }
  return value;
}

export function toSmppNpi(value: number): SmppNpi {
  if (!getSmppNpiValueSet().has(value)) {
    throw new Error(`Unknown npi value: ${value.toString(16)}`);
  }
  return value;
}
export function toSmppCommandId(value: number): SmppCommandId {
  if (!getSmppCommandIdValueSet().has(value)) {
    throw new Error(`Unknown command_id value: ${value.toString(16)}`);
  }
  return value;
}
