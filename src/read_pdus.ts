import { SmppConnection } from "./common.ts";

export async function* readSmppPdus(
  conn: SmppConnection,
): AsyncIterable<Uint8Array> {
  let tempBuffer = new Uint8Array(0);

  async function readBytes(
    targetBuffer: Uint8Array,
    start = 0,
    end = targetBuffer.length,
  ): Promise<number> {
    let bytesRead = 0;
    while (start < end) {
      if (tempBuffer.length > 0) {
        const bytesToCopy = Math.min(end - start, tempBuffer.length);
        targetBuffer.set(tempBuffer.subarray(0, bytesToCopy), start);
        tempBuffer = tempBuffer.slice(bytesToCopy);
        start += bytesToCopy;
        bytesRead += bytesToCopy;
      } else {
        const read = await conn.read(targetBuffer.subarray(start, end));

        if (read === null) {
          return bytesRead;
        }

        start += read;
        bytesRead += read;
      }
    }
    return bytesRead;
  }

  while (true) {
    const commandLengthBuffer = new Uint8Array(4);
    const bytesRead = await readBytes(commandLengthBuffer);

    if (bytesRead < 4) {
      // Connection closed or an error occurred
      return;
    }

    const commandLength = new DataView(commandLengthBuffer.buffer).getUint32(0, false);
    const pduBuffer = new Uint8Array(commandLength);
    pduBuffer.set(commandLengthBuffer, 0);

    const remainingBytes = commandLength - 4;

    const additionalBytesRead = await readBytes(pduBuffer, 4, commandLength);

    if (additionalBytesRead < remainingBytes) {
      // Connection closed or an error occurred
      return;
    }

    yield pduBuffer;
  }
}
