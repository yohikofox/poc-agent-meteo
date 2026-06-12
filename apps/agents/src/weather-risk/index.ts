import "../tracing";
import { connect, StringCodec } from "nats";
import type { MsgHdrs } from "nats";
import { context, propagation, trace, SpanStatusCode } from "@opentelemetry/api";
import { AgentResponse, WeatherData, WeatherRisk } from "../shared/types";
import { logger, traceCtx } from "../shared/logger";

const SUBJECT = "agents.weather.risk";
const sc = StringCodec();
const tracer = trace.getTracer("weather-risk-agent");

const natsGetter = {
  get: (carrier: MsgHdrs, key: string) => carrier.get(key) || undefined,
  keys: (carrier: MsgHdrs) => [...carrier.keys()],
};

function analyzeRisks(data: WeatherData): WeatherRisk[] {
  const { rainProbability, wind, temperature } = data;
  const risks: WeatherRisk[] = [];
  if (rainProbability > 70) risks.push({ type: "rain", level: "high", description: `Risque de pluie significatif (${rainProbability}%)` });
  else if (rainProbability > 40) risks.push({ type: "rain", level: "medium", description: `Risque de pluie modéré (${rainProbability}%)` });
  if (wind > 40) risks.push({ type: "wind", level: "high", description: `Vent fort (${wind} km/h)` });
  else if (wind > 20) risks.push({ type: "wind", level: "low", description: `Vent modéré (${wind} km/h)` });
  if (temperature > 35) risks.push({ type: "heat", level: "high", description: `Forte chaleur (${temperature}°C)` });
  else if (temperature < 0) risks.push({ type: "frost", level: "high", description: `Gel (${temperature}°C)` });
  else if (temperature < 5) risks.push({ type: "cold", level: "medium", description: `Froid (${temperature}°C)` });
  return risks;
}

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  logger.info({ subject: SUBJECT }, "Agent démarré");

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    const parentCtx = msg.headers
      ? propagation.extract(context.active(), msg.headers as MsgHdrs, natsGetter)
      : context.active();

    await tracer.startActiveSpan("weather.risk.analyze", {}, parentCtx, async (span) => {
      let result: AgentResponse<WeatherRisk[]>;
      try {
        const data = JSON.parse(sc.decode(msg.data)) as WeatherData;
        const risks = analyzeRisks(data);
        span.setAttribute("risks.count", risks.length);
        result = { status: "success", output: risks };
        logger.info({ ...traceCtx(), risksCount: risks.length, types: risks.map(r => r.type) }, "Risques analysés");
      } catch (err) {
        result = { status: "failed", reason: err instanceof Error ? err.message : String(err) };
        span.recordException(err instanceof Error ? err : new Error(result.reason!));
        span.setStatus({ code: SpanStatusCode.ERROR });
        logger.error({ ...traceCtx(), err: result.reason }, "Erreur");
      }
      span.end();
      msg.respond(sc.encode(JSON.stringify(result)));
    });
  }
}

main().catch((err) => { logger.error({ err }, "Erreur fatale"); process.exit(1); });
