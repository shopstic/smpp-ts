import { encodeHexString } from "./deps/std.ts";
import { smppCharsetEncode } from "./charset.ts";
import { SmppSupportedCharset, SmppTlv } from "./common.ts";
import { SmppMessageState } from "./message_state.ts";

export enum SmppKnownTlvTag {
  // Standard Optional Parameters (as per SMPP v3.4)
  DestAddrSubunit = 0x0005,
  DestNetworkType = 0x0006,
  DestBearerType = 0x0007,
  DestTelematicsId = 0x0008,
  SourceAddrSubunit = 0x000D,
  SourceNetworkType = 0x000E,
  SourceBearerType = 0x000F,
  SourceTelematicsId = 0x0010,
  QosTimeToLive = 0x0017,
  PayloadType = 0x0019,
  AdditionalStatusInfoText = 0x001D,
  ReceiptedMessageId = 0x001E,
  MsMsgWaitFacilities = 0x0030,
  PrivacyIndicator = 0x0201,
  SourceSubaddress = 0x0202,
  DestSubaddress = 0x0203,
  UserMessageReference = 0x0204,
  UserResponseCode = 0x0205,
  SourcePort = 0x020A,
  DestinationPort = 0x020B,
  SarMsgRefNum = 0x020C,
  LanguageIndicator = 0x020D,
  SarTotalSegments = 0x020E,
  SarSegmentSeqnum = 0x020F,
  ScInterfaceVersion = 0x0210,
  CallbackNumPresInd = 0x0302,
  CallbackNumAtag = 0x0303,
  NumberOfMessages = 0x0304,
  CallbackNum = 0x0381,
  DpfResult = 0x0420,
  SetDpf = 0x0421,
  MsAvailabilityStatus = 0x0422,
  NetworkErrorCode = 0x0423,
  MessagePayload = 0x0424,
  DeliveryFailureReason = 0x0425,
  MoreMessagesToSend = 0x0426,
  MessageState = 0x0427,
  UssdServiceOp = 0x0501,
  DisplayTime = 0x1201,
  SmsSignal = 0x1203,
  MsValidity = 0x1204,
  AlertOnMessageDelivery = 0x130C,
  ItsReplyType = 0x1380,
  ItsSessionInfo = 0x1383,
}

export interface SmppNetworkErrorCode {
  networkType: number;
  errorCode: number;
}

export function smppTlvDecodeValue(tlv: SmppTlv): unknown {
  switch (tlv.tag) {
    case SmppKnownTlvTag.MessageState:
      return smppTlvDecodeMessageState(tlv.value);
    case SmppKnownTlvTag.NetworkErrorCode:
      return smppTlvDecodeNetworkErrorCode(tlv.value);
    case SmppKnownTlvTag.ReceiptedMessageId:
      return smppTlvDecodeReceiptedMessageId(tlv.value);
    case SmppKnownTlvTag.MessagePayload:
      return tlv.value;
    default:
      return tlv.value;
  }
}

export function smppTlvEncodeReceiptedMessageId(value: string): Uint8Array {
  return new Uint8Array([
    ...smppCharsetEncode(value, SmppSupportedCharset.Ascii),
    0,
  ]);
}

export function smppTlvDecodeReceiptedMessageId(value: Uint8Array): string {
  if (value.length > 0) {
    let buf = value;

    if (value[value.length - 1] === 0) {
      buf = value.subarray(0, value.length - 1);
    }

    return String.fromCharCode(...buf);
  }

  return "";
}

export function smppTlvEncodeNetworkErrorCode(
  value: SmppNetworkErrorCode,
): Uint8Array {
  const data = new Uint8Array(3);
  const view = new DataView(data.buffer);

  view.setInt8(0, value.networkType);
  view.setInt16(1, value.errorCode);

  return data;
}

export function smppTlvDecodeNetworkErrorCode(
  value: Uint8Array,
): SmppNetworkErrorCode {
  if (value.length !== 3) {
    throw new Error(
      "NetworkErrorCode TLV value must be 3 bytes long, instead got " +
        encodeHexString(value),
    );
  }

  const dataView = new DataView(value.buffer);
  const networkType = dataView.getInt8(0);
  const errorCode = dataView.getInt16(1);

  return {
    networkType,
    errorCode,
  };
}

export function smppTlvEncodeMessageState(value: SmppMessageState): Uint8Array {
  return new Uint8Array([value]);
}

export function smppTlvDecodeMessageState(value: Uint8Array): SmppMessageState {
  if (value.length !== 1) {
    throw new Error(
      "MessageState TLV value must be 1 byte long, instead got " +
        encodeHexString(value),
    );
  }

  const state = value[0];

  if (state < 1 || state > 8) {
    throw new Error(
      "MessageState TLV value must be between 1 and 8, instead got " + state,
    );
  }

  return state;
}

export class SmppTlvs {
  static empty = new SmppTlvs([]);

  #map: Map<number, unknown> | undefined = undefined;
  constructor(public array: SmppTlv[]) {}

  get map() {
    if (this.#map === undefined) {
      this.#map = new Map(
        this.array.map((tlv) => [tlv.tag, smppTlvDecodeValue(tlv)]),
      );
    }
    return this.#map;
  }

  get receiptedMessageId(): string | undefined {
    return this.map.get(SmppKnownTlvTag.ReceiptedMessageId) as
      | string
      | undefined;
  }

  get networkErrorCode(): SmppNetworkErrorCode | undefined {
    return this.map.get(SmppKnownTlvTag.NetworkErrorCode) as
      | SmppNetworkErrorCode
      | undefined;
  }

  get messageState(): SmppMessageState | undefined {
    return this.map.get(SmppKnownTlvTag.MessageState) as
      | SmppMessageState
      | undefined;
  }

  get messagePayload(): Uint8Array | undefined {
    return this.map.get(SmppKnownTlvTag.MessagePayload) as
      | Uint8Array
      | undefined;
  }
}
