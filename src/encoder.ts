import {
  BindRequest,
  BindResponse,
  MessageRequest,
  MessageResponse,
  SmppBasePdu,
  SmppCommandId,
  SmppTlv,
} from "./common.ts";

export function encodeUint32(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, value, false); // Big-endian
  return new Uint8Array(buffer);
}

export function encodeUint8(value: number): Uint8Array {
  const buffer = new ArrayBuffer(1);
  const view = new DataView(buffer);
  view.setUint8(0, value);
  return new Uint8Array(buffer);
}

export function encodeUint16(value: number): Uint8Array {
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setInt16(0, value, false); // Big-endian
  return new Uint8Array(buffer);
}

export function encodeString(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function encodeNullTerminatedString(str: string): Uint8Array {
  return new Uint8Array([...encodeString(str), 0]);
}

export function encodeTlvs(tlvs: SmppTlv[]): Uint8Array {
  // Calculate the total size needed for the Uint8Array in one pass
  let totalSize = 0;
  for (let i = 0; i < tlvs.length; i++) {
    totalSize += 4 + tlvs[i].value.length;
  }

  // Create a Uint8Array with the calculated total size
  const buffer = new Uint8Array(totalSize);

  let offset = 0;

  for (const { tag, value } of tlvs) {
    // Write the tag (2 bytes)
    buffer[offset++] = (tag >> 8) & 0xFF; // High byte
    buffer[offset++] = tag & 0xFF; // Low byte

    // Write the length (2 bytes)
    const length = value.length;
    buffer[offset++] = (length >> 8) & 0xFF; // High byte
    buffer[offset++] = length & 0xFF; // Low byte

    // Write the value
    buffer.set(value, offset);
    offset += length;
  }

  return buffer;
}

function encodeBaseBytesArray(pdu: SmppBasePdu) {
  return [
    encodeUint32(pdu.commandId),
    encodeUint32(pdu.commandStatus),
    encodeUint32(pdu.sequenceNumber),
  ];
}

function concatUint8Arrays(arr: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (let i = 0; i < arr.length; i++) {
    totalLength += arr[i].length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const item of arr) {
    result.set(item, offset);
    offset += item.length;
  }
  return result;
}

function prependCommandLength(arr: Uint8Array[]): Uint8Array[] {
  let commandLength = 4;
  for (let i = 0; i < arr.length; i++) {
    commandLength += arr[i].length;
  }
  arr.unshift(encodeUint32(commandLength));
  return arr;
}

function encodeBase(pdu: SmppBasePdu): Uint8Array {
  return concatUint8Arrays(prependCommandLength(encodeBaseBytesArray(pdu)));
}

export function encodeBindRequestBytesArray(pdu: BindRequest) {
  const systemIdBytes = encodeNullTerminatedString(pdu.systemId);
  const passwordBytes = encodeNullTerminatedString(pdu.password);
  const systemTypeBytes = encodeNullTerminatedString(pdu.systemType);
  const interfaceVersionBytes = encodeUint8(pdu.interfaceVersion);
  const addrTonBytes = encodeUint8(pdu.addrTon);
  const addrNpiBytes = encodeUint8(pdu.addrNpi);
  const addressRangeBytes = encodeNullTerminatedString(pdu.addressRange);

  return [
    ...encodeBaseBytesArray(pdu),
    systemIdBytes,
    passwordBytes,
    systemTypeBytes,
    interfaceVersionBytes,
    addrTonBytes,
    addrNpiBytes,
    addressRangeBytes,
  ];
}

export function encodeBindRequest(pdu: BindRequest): Uint8Array {
  return concatUint8Arrays(prependCommandLength(encodeBindRequestBytesArray(pdu)));
}

export function encodeBindResponseBytesArray(pdu: BindResponse) {
  const systemIdBytes = encodeNullTerminatedString(pdu.systemId);
  const tlvBytes = pdu.tlvs.array.length > 0 ? encodeTlvs(pdu.tlvs.array) : new Uint8Array(0);

  return [
    ...encodeBaseBytesArray(pdu),
    systemIdBytes,
    tlvBytes,
  ];
}

export function encodeBindResponse(pdu: BindResponse): Uint8Array {
  return concatUint8Arrays(prependCommandLength(encodeBindResponseBytesArray(pdu)));
}

export function encodeMessageRequestBytesArray(pdu: MessageRequest) {
  const serviceTypeBytes = encodeNullTerminatedString(pdu.serviceType);

  const sourceAddrTonBytes = encodeUint8(pdu.sourceAddrTon);
  const sourceAddrNpiBytes = encodeUint8(pdu.sourceAddrNpi);
  const sourceAddrBytes = encodeNullTerminatedString(pdu.sourceAddr);

  const destAddrTonBytes = encodeUint8(pdu.destAddrTon);
  const destAddrNpiBytes = encodeUint8(pdu.destAddrNpi);
  const destinationAddrBytes = encodeNullTerminatedString(pdu.destinationAddr);

  const esmClassBytes = encodeUint8(pdu.esmClass.toByte());
  const protocolIdBytes = encodeUint8(pdu.protocolId);
  const priorityFlagBytes = encodeUint8(pdu.priorityFlag);
  const scheduleDeliveryTimeBytes = encodeNullTerminatedString(pdu.scheduleDeliveryTime);
  const validityPeriodBytes = encodeNullTerminatedString(pdu.validityPeriod);
  const registeredDeliveryBytes = encodeUint8(pdu.registeredDelivery.toByte());
  const replaceIfPresentFlagBytes = encodeUint8(pdu.replaceIfPresentFlag);
  const dataCodingBytes = encodeUint8(pdu.dataCoding);
  const smDefaultMsgIdBytes = encodeUint8(pdu.smDefaultMsgId);
  const smLengthBytes = encodeUint8(pdu.smLength);
  const shortMessageBytes = pdu.shortMessage;

  const tlvBytes = encodeTlvs(pdu.tlvs.array);

  return [
    ...encodeBaseBytesArray(pdu),
    serviceTypeBytes,
    sourceAddrTonBytes,
    sourceAddrNpiBytes,
    sourceAddrBytes,
    destAddrTonBytes,
    destAddrNpiBytes,
    destinationAddrBytes,
    esmClassBytes,
    protocolIdBytes,
    priorityFlagBytes,
    scheduleDeliveryTimeBytes,
    validityPeriodBytes,
    registeredDeliveryBytes,
    replaceIfPresentFlagBytes,
    dataCodingBytes,
    smDefaultMsgIdBytes,
    smLengthBytes,
    shortMessageBytes,
    tlvBytes,
  ];
}

export function encodeMessageRequest(pdu: MessageRequest): Uint8Array {
  return concatUint8Arrays(prependCommandLength(encodeMessageRequestBytesArray(pdu)));
}

export function encodeMessageResponseBytesArray(pdu: MessageResponse) {
  const messageIdBytes = encodeNullTerminatedString(pdu.messageId);
  const tlvsBytes = encodeTlvs(pdu.tlvs.array);

  return [
    ...encodeBaseBytesArray(pdu),
    messageIdBytes,
    tlvsBytes,
  ];
}

export function encodeMessageResponse(pdu: MessageResponse): Uint8Array {
  return concatUint8Arrays(prependCommandLength(encodeMessageResponseBytesArray(pdu)));
}

export function encodePdu(pdu: SmppBasePdu): Uint8Array {
  switch (pdu.commandId) {
    case SmppCommandId.BindTransmitter:
    case SmppCommandId.BindReceiver:
    case SmppCommandId.BindTransceiver:
      return encodeBindRequest(pdu as BindRequest);
    case SmppCommandId.BindTransmitterResp:
    case SmppCommandId.BindReceiverResp:
    case SmppCommandId.BindTransceiverResp:
      return encodeBindResponse(pdu as BindResponse);
    case SmppCommandId.Unbind:
    case SmppCommandId.UnbindResp:
    case SmppCommandId.EnquireLink:
    case SmppCommandId.EnquireLinkResp:
    case SmppCommandId.GenericNack:
      return encodeBase(pdu);
    case SmppCommandId.SubmitSm:
    case SmppCommandId.DeliverSm:
      return encodeMessageRequest(pdu as MessageRequest);
    case SmppCommandId.SubmitSmResp:
    case SmppCommandId.DeliverSmResp:
      return encodeMessageResponse(pdu as MessageResponse);
    default:
      throw new Error(`Unsupported PDU type: ${pdu.commandId}`);
  }
}
