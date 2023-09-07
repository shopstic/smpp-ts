import {
  BindRequest,
  BindResponse,
  MessageRequest,
  MessageResponse,
  Pdu,
  SmppBasePdu,
  SmppCommandId,
  Tlv,
  WithCommandLength,
} from "./common.ts";
import { SmppEsmClass } from "./esm_class.ts";

export class SmppDecoder {
  private dataView: DataView;
  private offset: number;

  constructor(bytes: Uint8Array, offset: number = 0) {
    this.dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = offset;
  }

  public decodeUint8(): number {
    this.checkOffset(1);
    const result = this.dataView.getUint8(this.offset);
    this.offset += 1;
    return result;
  }

  public decodeUint8Array(length: number): Uint8Array {
    this.checkOffset(length);
    const result = new Uint8Array(this.dataView.buffer, this.offset, length);
    this.offset += length;
    return result;
  }

  public decodeUint16(): number {
    this.checkOffset(2);
    const result = this.dataView.getUint16(this.offset, false);
    this.offset += 2;
    return result;
  }

  public decodeUint32(): number {
    this.checkOffset(4);
    const result = this.dataView.getUint32(this.offset, false);
    this.offset += 4;
    return result;
  }

  public decodeNullTerminatedString(maxLength: number): string {
    const buffer = new Uint8Array(maxLength);
    let length = 0;

    while (this.checkOffset(1) && this.dataView.getUint8(this.offset) !== 0 && length < maxLength) {
      buffer[length] = this.dataView.getUint8(this.offset);
      this.offset++;
      length++;
    }

    if (length === maxLength && this.dataView.getUint8(this.offset) !== 0) {
      throw new Error("Null terminator not found within maximum length");
    }

    this.offset++;
    return String.fromCharCode(...Array.from(buffer.subarray(0, length)));
  }

  public decodeTlvs(): Tlv[] {
    const tlvs: Tlv[] = [];

    while (this.offset < this.dataView.byteLength && this.checkOffset(4)) {
      const tag = this.dataView.getUint16(this.offset);
      this.offset += 2;
      const length = this.dataView.getUint16(this.offset);
      this.offset += 2;
      if (!this.checkOffset(length)) {
        throw new Error("TLV value length exceeds remaining buffer length");
      }
      const value = new Uint8Array(this.dataView.buffer.slice(this.offset, this.offset + length));
      this.offset += length;
      tlvs.push({ tag, value });
    }

    return tlvs;
  }

  private checkOffset(length: number): boolean {
    if (this.offset + length > this.dataView.byteLength) {
      throw new Error(
        `Offset exceeds buffer length. Current offset: ${this.offset}. Buffer length: ${this.dataView.byteLength}. Desired length: ${length}.`,
      );
    }
    return true;
  }

  public hasRemainingData(): boolean {
    return this.offset < this.dataView.byteLength;
  }
}

export function decodeCommon(bytes: Uint8Array) {
  const decoder = new SmppDecoder(bytes);
  const commandLength = decoder.decodeUint32();
  const commandId = decoder.decodeUint32();
  const commandStatus = decoder.decodeUint32();
  const sequenceNumber = decoder.decodeUint32();

  return {
    decoder,
    commandLength,
    commandId,
    commandStatus,
    sequenceNumber,
  };
}

export function decodeBase(bytes: Uint8Array): WithCommandLength<SmppBasePdu> {
  const { commandLength, commandId, commandStatus, sequenceNumber } = decodeCommon(bytes);

  return {
    commandLength,
    commandId,
    commandStatus,
    sequenceNumber,
  };
}

export function decodeBindRequest(bytes: Uint8Array): WithCommandLength<BindRequest> {
  const { decoder, commandLength, commandId, commandStatus, sequenceNumber } = decodeCommon(bytes);
  const systemId = decoder.decodeNullTerminatedString(16);
  const password = decoder.decodeNullTerminatedString(9);
  const systemType = decoder.decodeNullTerminatedString(13);
  const interfaceVersion = decoder.decodeUint8();
  const addrTon = decoder.decodeUint8();
  const addrNpi = decoder.decodeUint8();
  const addressRange = decoder.decodeNullTerminatedString(41);

  return {
    commandLength,
    commandId,
    commandStatus,
    sequenceNumber,
    systemId,
    password,
    systemType,
    interfaceVersion,
    addrTon,
    addrNpi,
    addressRange,
  };
}

export function decodeBindResponse(bytes: Uint8Array): WithCommandLength<BindResponse> {
  const { decoder, commandLength, commandId, commandStatus, sequenceNumber } = decodeCommon(bytes);
  const systemId = decoder.hasRemainingData() ? decoder.decodeNullTerminatedString(16) : "";
  const tlvs = decoder.decodeTlvs();

  return {
    commandLength,
    commandId,
    commandStatus,
    sequenceNumber,
    systemId,
    tlvs,
  };
}

export function decodeMessageRequest(bytes: Uint8Array): WithCommandLength<MessageRequest> {
  const { decoder, commandLength, commandId, commandStatus, sequenceNumber } = decodeCommon(bytes);
  const serviceType = decoder.decodeNullTerminatedString(6);
  const sourceAddrTon = decoder.decodeUint8();
  const sourceAddrNpi = decoder.decodeUint8();
  const sourceAddr = decoder.decodeNullTerminatedString(21);
  const destAddrTon = decoder.decodeUint8();
  const destAddrNpi = decoder.decodeUint8();
  const destinationAddr = decoder.decodeNullTerminatedString(21);
  const esmClass = SmppEsmClass.fromByte(decoder.decodeUint8());
  const protocolId = decoder.decodeUint8();
  const priorityFlag = decoder.decodeUint8();
  const scheduleDeliveryTime = decoder.decodeNullTerminatedString(17);
  const validityPeriod = decoder.decodeNullTerminatedString(17);
  const registeredDelivery = decoder.decodeUint8();
  const replaceIfPresentFlag = decoder.decodeUint8();
  const dataCoding = decoder.decodeUint8();
  const smDefaultMsgId = decoder.decodeUint8();
  const smLength = decoder.decodeUint8();
  const shortMessage = decoder.decodeUint8Array(smLength);
  const tlvs = decoder.decodeTlvs();

  return {
    commandLength,
    commandId,
    commandStatus,
    sequenceNumber,
    serviceType,
    sourceAddrTon,
    sourceAddrNpi,
    sourceAddr,
    destAddrTon,
    destAddrNpi,
    destinationAddr,
    esmClass,
    protocolId,
    priorityFlag,
    scheduleDeliveryTime,
    validityPeriod,
    registeredDelivery,
    replaceIfPresentFlag,
    dataCoding,
    smDefaultMsgId,
    smLength,
    shortMessage,
    tlvs,
  };
}

export function decodeMessageResponse(bytes: Uint8Array): WithCommandLength<MessageResponse> {
  const { decoder, commandLength, commandId, commandStatus, sequenceNumber } = decodeCommon(bytes);
  const messageId = decoder.decodeNullTerminatedString(65);
  const tlvs = decoder.decodeTlvs();

  return {
    commandLength,
    commandId,
    commandStatus,
    sequenceNumber,
    messageId,
    tlvs,
  };
}

export function decodePdu(bytes: Uint8Array): Pdu {
  const commandId = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, false);

  switch (commandId) {
    case SmppCommandId.BindTransmitter:
    case SmppCommandId.BindReceiver:
    case SmppCommandId.BindTransceiver:
      return decodeBindRequest(bytes) as Pdu;
    case SmppCommandId.BindTransmitterResp:
    case SmppCommandId.BindReceiverResp:
    case SmppCommandId.BindTransceiverResp:
      return decodeBindResponse(bytes) as Pdu;
    case SmppCommandId.Unbind:
    case SmppCommandId.UnbindResp:
    case SmppCommandId.EnquireLink:
    case SmppCommandId.EnquireLinkResp:
    case SmppCommandId.GenericNack:
      return decodeBase(bytes) as Pdu;
    case SmppCommandId.SubmitSm:
    case SmppCommandId.DeliverSm:
      return decodeMessageRequest(bytes) as Pdu;
    case SmppCommandId.SubmitSmResp:
    case SmppCommandId.DeliverSmResp:
      return decodeMessageResponse(bytes) as Pdu;
    default:
      throw new Error(`Unsupported PDU type: ${commandId}`);
  }
}
