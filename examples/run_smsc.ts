import { signal } from "../src/deps.ts";
import { withTimeout } from "../src/lib/util.ts";
import { runSmsc } from "../src/run/run_smsc.ts";

const server = Deno.listen({ port: 12775 });
console.log("SMSC Server is up on port 12775");

const abortController = new AbortController();
const pendingClients = new Map<number, Promise<void>>();
let clientIdSeed = 0;

(async () => {
  for await (const connection of server) {
    const clientId = ++clientIdSeed;
    const remoteAddr = (() => {
      if (connection.remoteAddr.transport === "tcp") {
        return `${connection.remoteAddr.hostname}:${connection.remoteAddr.port}`;
      }
      return JSON.stringify(connection.remoteAddr);
    })();

    pendingClients.set(
      clientId,
      (async () => {
        try {
          console.log(`Client addr=${remoteAddr} id=${clientId} start`);
          await runSmsc({
            windowSize: 10,
            connection,
            enquireLinkIntervalMs: 5000,
            authenticate({ systemId, password }) {
              return Promise.resolve(systemId === "gen--50016" && password === "ztZvihAa");
            },
            signal: abortController.signal,
          });
        } catch (error) {
          console.log(`Client addr=${remoteAddr} id=${clientId} failed with error: ${error}`);
        } finally {
          console.log(`Client addr=${remoteAddr} id=${clientId} end`);
          pendingClients.delete(clientId);
          connection.close();
        }
      })(),
    );
  }
})();

for await (const _ of signal("SIGTERM", "SIGINT")) {
  console.log(`Got termination signal, going to unbind all clients (${pendingClients.size})`);
  abortController.abort();

  try {
    await withTimeout("Unbind all clients", 5000, () => Promise.allSettled(pendingClients.values()));
  } catch (e) {
    console.log(`Failed to cleanly unbind all clients in time: ${e}`);
  }
  break;
}

server.close();
