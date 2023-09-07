import { run } from "smpp-ts";
import { PromiseSocket } from "promise-socket"
import { Socket } from "net"

const promiseSocket = new PromiseSocket(new Socket())

await promiseSocket.connect({ host: "198.19.198.128", port: 2775 });
const windowSize = 10;

const bridge = {
  read: async (p) => {
    const data = await promiseSocket.read(p.length);

    if (data === undefined) {
      return null;
    }

    if (Buffer.isBuffer(data)) {
      const readBytes = data.length;
      data.copy(p, 0, 0, readBytes);
      return readBytes;
    }

    return null;
  },
  write: async (p) => {
    const buffer = Buffer.from(p.buffer, p.byteOffset, p.byteLength);
    return await promiseSocket.write(buffer);
  },
};

await run({ windowSize, connection: bridge, systemId: "gen--50016", password: "ztZvihAa4" });
