export async function* readSmppPdus(
  reader: ReadableStreamBYOBReader,
): AsyncIterable<Uint8Array> {
  async function read(buffer: ArrayBuffer, offset = 0, length = buffer.byteLength): Promise<ArrayBuffer | null> {
    let bytesRead = 0;
    let buf = buffer;

    while (bytesRead < length) {
      const { done, value } = await reader.read(new Uint8Array(buf, bytesRead + offset, length - bytesRead));

      if (!value) {
        return null;
      }

      buf = value.buffer;
      bytesRead += value.byteLength;

      if (done) {
        break;
      }
    }

    return bytesRead < length ? null : buf;
  }

  while (true) {
    const commandLengthBuffer = await read(new ArrayBuffer(4));

    if (commandLengthBuffer === null) {
      return;
    }

    const commandLength = new DataView(commandLengthBuffer).getUint32(0, false);
    const pduBuffer = new ArrayBuffer(commandLength);
    new Uint8Array(pduBuffer, 0, 4).set(new Uint8Array(commandLengthBuffer));

    const pdu = await read(pduBuffer, 4, commandLength - 4);

    if (pdu === null) {
      return;
    }

    yield new Uint8Array(pdu);
  }
}
