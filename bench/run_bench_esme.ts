import { smppCharsetEncode } from "../src/charset.ts";
import { SmppKnownCommandStatus } from "../src/command_status.ts";
import { SmppCommandId, SmppKnownDataCoding, SmppNpi, SmppSupportedCharset, SmppTon, SubmitSm } from "../src/common.ts";
import { delay } from "../src/deps/std.ts";
import { promiseAllSettledTogether } from "../src/deps/utils.ts";
import { SmppEsmClass, SmppMessageType, SmppMessagingMode } from "../src/esm_class.ts";
import { SmppRegisteredDelivery } from "../src/registered_delivery.ts";
import { SmppTlvs } from "../src/tlv.ts";
import { AnsiColors, DefaultLogger } from "./deps.ts";
import { BenchEsmeController, runBenchEsme } from "./lib/bench_esme.ts";
import { createMainSignal } from "./lib/main_signal.ts";

const logger = DefaultLogger.prefixed(AnsiColors.gray("esme"));

const submitSmDefaults = {
  commandStatus: SmppKnownCommandStatus.ESME_ROK,
  sequenceNumber: 0,
  serviceType: "",
  sourceAddrTon: SmppTon.International,
  sourceAddrNpi: SmppNpi.E164,
  destAddrTon: SmppTon.International,
  destAddrNpi: SmppNpi.E164,
  esmClass: new SmppEsmClass(
    SmppMessagingMode.Default,
    SmppMessageType.NormalMessage,
  ),
  protocolId: 0,
  priorityFlag: 0,
  scheduleDeliveryTime: "",
  validityPeriod: "",
  registeredDelivery: SmppRegisteredDelivery.All,
  replaceIfPresentFlag: 0,
  dataCoding: 0,
  smDefaultMsgId: 0,
  tlvs: SmppTlvs.empty,
} satisfies Partial<SubmitSm>;

type SubmitSmWithDefaults =
  & Omit<SubmitSm, "smLength" | "commandId" | keyof typeof submitSmDefaults>
  & Partial<typeof submitSmDefaults>;

function createSubmitSm(fields: SubmitSmWithDefaults): SubmitSm {
  const smLength = fields.shortMessage?.length ?? 0;

  return {
    ...submitSmDefaults,
    ...fields,
    commandId: SmppCommandId.SubmitSm,
    smLength,
  };
}

const stats = {
  mtTotal: 0,
  mtRespTotal: 0,
  drTotal: 0,
};

const { signal: mainSignal, abortController: mainAbortController } = createMainSignal(logger);
mainSignal.addEventListener("abort", () => {
  clearInterval(timer);
}, { once: true });

async function control(
  { submitSmQueue, submitSmRespQueue, deliverSmQueue }: BenchEsmeController<string>,
): Promise<void> {
  const mtFlowPromise = (async () => {
    try {
      while (!mainSignal.aborted) {
        const context = crypto.randomUUID();
        const pdu = createSubmitSm({
          sourceAddr: "+12001234567",
          destinationAddr: "+12001234568",
          shortMessage: smppCharsetEncode(`Benchmark message ${context} in ASCII`, SmppSupportedCharset.Ucs2),
          dataCoding: SmppKnownDataCoding.Ia5,
        });

        await submitSmQueue.enqueue({ context, pdu });
        stats.mtTotal++;
      }
    } finally {
      submitSmQueue.complete();
    }
  })();

  const mtRespFlowPromise = (async () => {
    try {
      for await (const _ of submitSmRespQueue.items()) {
        stats.mtRespTotal++;
      }
    } finally {
      submitSmRespQueue.complete();
    }
  })();

  const drFlowPromise = (async () => {
    try {
      for await (const { pdu, respond } of deliverSmQueue.items()) {
        await respond({
          commandId: SmppCommandId.DeliverSmResp,
          sequenceNumber: pdu.sequenceNumber,
          commandStatus: SmppKnownCommandStatus.ESME_ROK,
          messageId: "",
          tlvs: SmppTlvs.empty,
        });
        stats.drTotal++;
      }
    } finally {
      deliverSmQueue.complete();
    }
  })();

  await promiseAllSettledTogether({
    mt: mtFlowPromise,
    mtResp: mtRespFlowPromise,
    dr: drFlowPromise,
  }, 5000);
}

let lastStats: typeof stats | undefined = undefined;
const connectionCount = 10;

const timer = setInterval(() => {
  const { mtTotal, mtRespTotal, drTotal } = stats;
  const mtRate = mtTotal - (lastStats?.mtTotal ?? 0);
  const mtRespRate = mtRespTotal - (lastStats?.mtRespTotal ?? 0);
  const drRate = drTotal - (lastStats?.drTotal ?? 0);
  logger.info?.("mt/s", mtRate, "mt_resp/s", mtRespRate, "dr/s", drRate);
  lastStats = structuredClone(stats);
}, 1000);

try {
  const promises = Array.from({ length: connectionCount }).map(async (_, i) => {
    while (!mainSignal.aborted) {
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      mainSignal.addEventListener("abort", onAbort, { once: true });

      try {
        const { controller, esmePromise } = await runBenchEsme<string>({
          systemId: "test",
          password: "test",
          smscHostname: "127.0.0.1",
          smscPort: 12775,
          windowSize: 100,
          logger: logger.prefixed(AnsiColors.gray(String(i))),
          signal: ac.signal,
          mtPerSecondRateLimit: 100000,
        });

        await promiseAllSettledTogether({
          control: control(controller).finally(() => ac.abort()),
          esme: esmePromise,
        }, 5000);
      } catch (e) {
        logger.error?.("session", i, "failed:", e);
      } finally {
        mainSignal.removeEventListener("abort", onAbort);
      }

      try {
        await delay(2000, { signal: mainSignal });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // Ignore
        } else {
          throw e;
        }
      }
    }
  });

  await Promise.all(promises);
} finally {
  mainAbortController.abort();
}
