import { SmppEsmClass } from "./esm_class.ts";

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

export const SmppCommandIdByValueMap = new Map(Array.from(Object.entries(SmppCommandId)).map(([k, v]) => [v, k]));

export enum SmppTon {
  Unknown = 0x00,
  International = 0x01,
  National = 0x02,
  NationalSpecific = 0x03,
  SubscriberNumber = 0x04,
  Alphanumeric = 0x05,
  Abbreviated = 0x06,
}

export const SmppTonByValueMap = new Map(Array.from(Object.entries(SmppTon)).map(([k, v]) => [v, k]));

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

export const SmppNpiByValueMap = new Map(Array.from(Object.entries(SmppNpi)).map(([k, v]) => [v, k]));

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

export interface Tlv {
  tag: number;
  value: Uint8Array;
}

export interface BindRequest extends SmppBasePdu {
  commandId: SmppCommandId.BindTransmitter | SmppCommandId.BindReceiver | SmppCommandId.BindTransceiver;
  systemId: string;
  password: string;
  systemType: string;
  interfaceVersion: number;
  addrTon: number;
  addrNpi: number;
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
  tlvs: Tlv[];
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
  registeredDelivery: number;
  replaceIfPresentFlag: number;
  dataCoding: number;
  smDefaultMsgId: number;
  smLength: number;
  shortMessage: Uint8Array;
  tlvs: Tlv[];
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
  messageId: string;
  tlvs: Tlv[];
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
export type DeliverSmResp = MessageRequest & {
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

export type Pdu =
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

export function isBindRequest(commandId: SmppCommandId) {
  return commandId === SmppCommandId.BindTransmitter ||
    commandId === SmppCommandId.BindReceiver ||
    commandId === SmppCommandId.BindTransceiver;
}

export function isSmppRequest(commandId: SmppCommandId) {
  switch (commandId) {
    case SmppCommandId.Unbind:
    case SmppCommandId.SubmitSm:
    case SmppCommandId.DeliverSm:
    case SmppCommandId.EnquireLink:
      return true;
    default:
      return isBindRequest(commandId);
  }
}

export function isSmppResponse(commandId: SmppCommandId) {
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
