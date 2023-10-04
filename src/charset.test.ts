import { assertEquals } from "./deps/std.ts";
import { smppCharsetDecode, smppCharsetEncode } from "./charset.ts";
import { SmppSupportedCharset } from "./common.ts";

Deno.test("round trip encoding ascii", () => {
  const str = "hello world";
  const buf = smppCharsetEncode(str, SmppSupportedCharset.Ascii);
  const decoded = smppCharsetDecode(buf, SmppSupportedCharset.Ascii);
  assertEquals(decoded, str);
});

Deno.test("round trip encoding latin1", () => {
  const str =
    "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¢£¤¥¦§¨©ª«¬SHY®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ";
  const buf = smppCharsetEncode(str, SmppSupportedCharset.Latin1);
  const decoded = smppCharsetDecode(buf, SmppSupportedCharset.Latin1);
  assertEquals(decoded, str);
});

Deno.test("round trip encoding ucs2", () => {
  const str = "thử xem 🌭 tiếng ♈♉☔⚡⚒️⚔️⭐🀄|2⛔😑🖕🖖|🌭🌮🍎🍏 việt 🌭😬";
  const buf = smppCharsetEncode(str, SmppSupportedCharset.Ucs2);
  const decoded = smppCharsetDecode(buf, SmppSupportedCharset.Ucs2);
  assertEquals(decoded, str);
});
