import { AnsiColors, DefaultLogger } from "./deps.ts";
import { BenchSmscStats, runBenchSmsc } from "./lib/bench_smsc.ts";
import { createMainSignal } from "./lib/main_signal.ts";

const logger = DefaultLogger.prefixed(AnsiColors.gray("smsc"));
const { signal: mainSignal } = createMainSignal(logger);

let lastStats: BenchSmscStats | undefined = undefined;
let getStats: undefined | (() => BenchSmscStats);

const timer = setInterval(() => {
  const stats = getStats?.();
  if (!stats) return;

  const { connectionCount, failedAuthTotal, mtTotal, drTotal } = stats;
  const failedAuthRate = failedAuthTotal - (lastStats?.failedAuthTotal ?? 0);
  const mtRate = mtTotal - (lastStats?.mtTotal ?? 0);
  const drRate = drTotal - (lastStats?.drTotal ?? 0);

  logger.info?.("conn", connectionCount, "failed_auth/s", failedAuthRate, "mt/s", mtRate, "dr/s", drRate);
  lastStats = structuredClone(stats);
}, 1000);

mainSignal.addEventListener("abort", () => {
  clearInterval(timer);
}, { once: true });

await runBenchSmsc({
  authenticate: () => true,
  hostname: "0.0.0.0",
  port: 12775,
  logger,
  signal: mainSignal,
  windowSize: 100,
  statsGetter: (getter) => {
    getStats = getter;
  },
});
