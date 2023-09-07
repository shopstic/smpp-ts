import { runEsme } from "../src/run/run_esme.ts";

const connection = await Deno.connect({ hostname: "127.0.0.1", port: 12775 });

try {
  await runEsme({
    windowSize: 10,
    connection,
    systemId: "gen--50016",
    password: "ztZvihAa",
    enquireLinkIntervalMs: 5000,
  });
} finally {
  connection.close();
}
