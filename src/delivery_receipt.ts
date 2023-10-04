import { SmppMessageState } from "./message_state.ts";
import { SmppNetworkErrorCode } from "./tlv.ts";
import { parseDate } from "./deps/std.ts";
import { DeliverSm, SmppSupportedCharset } from "./common.ts";
import { smppCharsetDecode } from "./charset.ts";

export interface SmppDeliveryReceipt {
  messageId: string;
  messageState: SmppMessageState;
  networkErrorCode?: SmppNetworkErrorCode;
  submitCount?: number;
  deliveredCount?: number;
  submitDate?: Date;
  doneDate?: Date;
}

const messageStateMap: Record<string, SmppMessageState> = {
  enroute: SmppMessageState.Enroute,
  delivrd: SmppMessageState.Delivered,
  expired: SmppMessageState.Expired,
  deleted: SmppMessageState.Deleted,
  undeliv: SmppMessageState.Undeliverable,
  acceptd: SmppMessageState.Accepted,
  unknown: SmppMessageState.Unknown,
  rejectd: SmppMessageState.Rejected,
};

const regex = /([a-zA-Z\s]+):([^\s]*)\s/g;

export function parseDeliveryReceipt(
  deliverSm: DeliverSm,
  dateFormat = "yyMMddHHmm",
): SmppDeliveryReceipt {
  const shortMessage = smppCharsetDecode(
    deliverSm.shortMessage,
    SmppSupportedCharset.Ascii,
  );
  const receipt = parseDeliveryReceiptFromShortMessage(
    shortMessage,
    dateFormat,
  );

  const messageIdFromTlv = deliverSm.tlvs.receiptedMessageId;
  const messageStateFromTlv = deliverSm.tlvs.messageState;
  const networkErrorCodeFromTlv = deliverSm.tlvs.networkErrorCode;

  if (
    messageIdFromTlv !== undefined && messageIdFromTlv !== receipt.messageId
  ) {
    throw new Error(
      `The 'receiptedMessageId' TLV value of '${messageIdFromTlv}' does not match the short_message 'id' field value of '${receipt.messageId}'`,
    );
  }

  if (
    messageStateFromTlv !== undefined &&
    messageStateFromTlv !== receipt.messageState
  ) {
    throw new Error(
      `The 'messageState' TLV value of '${messageStateFromTlv}' does not match the short_message 'stat' field value of '${receipt.messageState}'`,
    );
  }

  if (
    networkErrorCodeFromTlv !== undefined &&
    receipt.networkErrorCode !== undefined &&
    networkErrorCodeFromTlv.errorCode !== receipt.networkErrorCode.errorCode
  ) {
    throw new Error(
      `The 'networkErrorCode' TLV value of '${networkErrorCodeFromTlv.errorCode}' does not match the short_message 'err' field value of '${receipt.networkErrorCode.errorCode}'`,
    );
  }

  if (receipt.networkErrorCode === undefined) {
    return {
      ...receipt,
      networkErrorCode: networkErrorCodeFromTlv,
    };
  }

  return receipt;
}

export function parseDeliveryReceiptFromShortMessage(
  message: string,
  dateFormat: string,
): SmppDeliveryReceipt {
  const fields: Record<string, string> = {};
  let match;

  // Populate the fields object with key-value pairs extracted from the message string
  while ((match = regex.exec(message)) !== null) {
    const value = match[2].trim();
    if (value.length > 0) {
      fields[match[1].trim()] = value;
    }
  }

  const messageId = fields["id"];
  if (messageId === undefined) {
    throw new Error("The 'id' field is missing");
  }

  const messageStateRaw = fields["stat"];
  if (messageStateRaw === undefined) {
    throw new Error("The 'stat' field is missing");
  }

  const messageState = messageStateMap[messageStateRaw.toLowerCase()];
  if (messageState === undefined) {
    throw new Error(`The 'stat' field value of ${messageStateRaw} is invalid`);
  }

  const networkErrorCode: SmppNetworkErrorCode | undefined =
    (fields["err"] !== undefined)
      ? {
        networkType: 0,
        errorCode: parseInt(fields["err"]),
      }
      : undefined;

  const submitCount: number | undefined = (fields["sub"] !== undefined)
    ? parseInt(fields["sub"])
    : undefined;

  const deliveredCount: number | undefined = (fields["dlvrd"] !== undefined)
    ? parseInt(fields["dlvrd"])
    : undefined;

  const submitDate: Date | undefined = fields["submit date"] !== undefined
    ? parseDate(fields["submit date"], dateFormat)
    : undefined;

  const doneDate: Date | undefined = fields["done date"] !== undefined
    ? parseDate(fields["done date"], dateFormat)
    : undefined;

  const receipt: SmppDeliveryReceipt = {
    messageId,
    messageState,
    networkErrorCode,
    submitCount,
    deliveredCount,
    submitDate: submitDate,
    doneDate: doneDate,
  };

  return receipt;
}
