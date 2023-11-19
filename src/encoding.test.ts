import { decodeHex, encodeHex } from "./deps/std.ts";
import { SmppEsmClass, SmppFeature, SmppMessageType, SmppMessagingMode } from "./esm_class.ts";
import { SmppKnownTlvTag, SmppTlvs } from "./tlv.ts";
import { SmppKnownCommandStatus } from "./command_status.ts";
import {
  BindRequestKeys,
  BindResponseKeys,
  BindTransceiver,
  BindTransmitterResp,
  HexFormOf,
  MessageRequestKeys,
  MessageResponseKeys,
  SmppCommandId,
  SmppNpi,
  SmppTon,
  SubmitSm,
  SubmitSmResp,
  WithCommandLength,
} from "./common.ts";
import { decodeBindRequest, decodeBindResponse, decodeMessageRequest, decodeMessageResponse } from "./decoder.ts";
import { encodeBindRequest, encodeBindResponse, encodeMessageRequest, encodeMessageResponse } from "./encoder.ts";
import { SmppRegisteredDelivery } from "./registered_delivery.ts";
import { assertEquals } from "./deps/std_test.ts";

Deno.test("BindRequest serdes", async (t) => {
  const pdu = {
    commandLength: 44,
    commandId: SmppCommandId.BindTransceiver,
    commandStatus: SmppKnownCommandStatus.ESME_ROK,
    sequenceNumber: 1,
    systemId: "foo-bar",
    password: "baz-boom",
    systemType: "meh",
    interfaceVersion: 0x34,
    addrTon: SmppTon.Alphanumeric,
    addrNpi: SmppNpi.National,
    addressRange: "abc",
  } satisfies WithCommandLength<BindTransceiver>;

  const expected: HexFormOf<typeof pdu> = {
    commandLength: "0000002C", // 44
    commandId: "00000009", // bind_transceiver
    commandStatus: "00000000", // n/a
    sequenceNumber: "00000001", // 1
    systemId: "666F6F2D62617200", // foo-bar
    password: "62617A2D626F6F6D00", // baz-boom
    systemType: "6D656800", // meh
    interfaceVersion: "34", // ESME supports SMPP version 3.4
    addrTon: "05", // Alphanumeric
    addrNpi: "08", // National
    addressRange: "61626300", // abc
  };

  const expectedInHex = BindRequestKeys.map((key) => expected[key].toLowerCase()).join("");

  await t.step("encode", () => {
    const actualInHex = encodeHex(encodeBindRequest(pdu));
    assertEquals(actualInHex, expectedInHex);
  });

  await t.step("decode", () => {
    const actual = decodeBindRequest(decodeHex(expectedInHex));
    assertEquals(actual, pdu);
  });
});

Deno.test("BindResponse", async (t) => {
  const pdu = {
    commandLength: 32,
    commandId: SmppCommandId.BindTransmitterResp,
    commandStatus: SmppKnownCommandStatus.ESME_RINVSYSID,
    sequenceNumber: 1,
    systemId: "foo-bar",
    tlvs: new SmppTlvs([{
      tag: SmppKnownTlvTag.ScInterfaceVersion,
      value: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
    }]),
  } satisfies WithCommandLength<BindTransmitterResp>;

  const expected: HexFormOf<WithCommandLength<BindTransmitterResp>> = {
    commandLength: "00000020", // 32
    commandId: "80000002", // bind_transmitter_resp
    commandStatus: "0000000F", // ESME_RINVSYSID(Invalid System ID)
    sequenceNumber: "00000001", // 1
    systemId: "666F6F2D62617200", // foo-bar
    tlvs: "0210000401020304",
  };

  const expectedInHex = BindResponseKeys.map((key) => expected[key].toLowerCase()).join("");

  await t.step("encode", () => {
    const actualInHex = encodeHex(encodeBindResponse(pdu));
    assertEquals(actualInHex, expectedInHex);
  });

  await t.step("decode", () => {
    const actual = decodeBindResponse(decodeHex(expectedInHex));
    assertEquals(actual, pdu);
  });
});

Deno.test("MessageRequest", async (t) => {
  const shortMessage = new TextEncoder().encode("Hello, world!");
  const pdu = {
    commandLength: 72,
    commandId: SmppCommandId.SubmitSm,
    commandStatus: SmppKnownCommandStatus.ESME_ROK,
    sequenceNumber: 1,
    serviceType: "foo",
    sourceAddrTon: SmppTon.National,
    sourceAddrNpi: SmppNpi.National,
    sourceAddr: "bar",
    destAddrTon: SmppTon.International,
    destAddrNpi: SmppNpi.E164,
    destinationAddr: "+12015551234",
    esmClass: new SmppEsmClass(
      SmppMessagingMode.StoreAndForward,
      SmppMessageType.DeliveryAcknowledgement,
      new Set([SmppFeature.SetReplyPath]),
    ),
    protocolId: 0,
    priorityFlag: 0,
    scheduleDeliveryTime: "",
    validityPeriod: "",
    registeredDelivery: SmppRegisteredDelivery.All,
    replaceIfPresentFlag: 0,
    dataCoding: 0,
    smDefaultMsgId: 0,
    smLength: shortMessage.length,
    shortMessage,
    tlvs: new SmppTlvs([{
      tag: SmppKnownTlvTag.AlertOnMessageDelivery,
      value: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
    }]),
  } satisfies WithCommandLength<SubmitSm>;

  const expected: HexFormOf<typeof pdu> = {
    commandLength: "00000048", // 72
    commandId: "00000004", // submit_sm
    commandStatus: "00000000", // n/a
    sequenceNumber: "00000001", // 1
    serviceType: "666F6F00", // foo
    sourceAddrTon: "02", // National
    sourceAddrNpi: "08", // National
    sourceAddr: "62617200", // bar
    destAddrTon: "01", // International
    destAddrNpi: "01", // ISDN (E163/E164)
    destinationAddr: "2B313230313535353132333400", // +12015551234
    esmClass: "8B", // 10001011
    protocolId: "00", // SME to SME protocol
    priorityFlag: "00", // Level 0 (lowest) priority
    scheduleDeliveryTime: "00", // null
    validityPeriod: "00", // null
    registeredDelivery: "11", // 00010001
    replaceIfPresentFlag: "00", // Do not replace (default)
    dataCoding: "00", // no message class, text uncompress, SMSC Default Alphabet
    smDefaultMsgId: "00", // 0
    smLength: "0D", // 13
    shortMessage: "48656C6C6F2C20776F726C6421", // Hello, world!
    tlvs: "130C000401020304",
  };

  const expectedInHex = MessageRequestKeys.map((key) => expected[key].toLowerCase()).join("");

  await t.step("encode", () => {
    const actualInHex = encodeHex(encodeMessageRequest(pdu));
    assertEquals(actualInHex, expectedInHex);
  });

  await t.step("decode", () => {
    const actual = decodeMessageRequest(decodeHex(expectedInHex));
    assertEquals(actual, pdu);
  });
});

Deno.test("MessageResponse", async (t) => {
  const pdu = {
    commandLength: 32,
    commandId: SmppCommandId.SubmitSmResp,
    commandStatus: SmppKnownCommandStatus.ESME_ROK,
    sequenceNumber: 1,
    messageId: "foo bar baz boo",
    tlvs: SmppTlvs.empty,
  } satisfies WithCommandLength<SubmitSmResp>;

  const expected: HexFormOf<typeof pdu> = {
    commandLength: "00000020", // 32
    commandId: "80000004", // submit_sm_resp
    commandStatus: "00000000", // ESME_ROK(No Error)
    sequenceNumber: "00000001", // 1
    messageId: "666F6F206261722062617A20626F6F00", // foo bar baz boo
    tlvs: "",
  };

  const expectedInHex = MessageResponseKeys.map((key) => expected[key].toLowerCase()).join("");

  await t.step("encode", () => {
    const actualInHex = encodeHex(encodeMessageResponse(pdu));
    assertEquals(actualInHex, expectedInHex);
  });

  await t.step("decode", () => {
    const actual = decodeMessageResponse(decodeHex(expectedInHex));
    assertEquals(actual, pdu);
  });
});
