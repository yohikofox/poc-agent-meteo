import "../tracing";
import { connect, StringCodec } from "nats";
import type { MsgHdrs } from "nats";
import { context, propagation, trace, SpanStatusCode } from "@opentelemetry/api";
import { OpenMeteoForecastClient } from "../clients/OpenMeteoForecastClient";
import { AgentResponse, GeoLocation, WeatherData } from "../shared/types";
import { logger, traceCtx } from "../shared/logger";

const SUBJECT = "agents.weather.fetch";
const sc = StringCodec();
const client = new OpenMeteoForecastClient();
const tracer = trace.getTracer("weather-fetch-agent");

const natsGetter = {
  get: (carrier: MsgHdrs, key: string) => carrier.get(key) || undefined,
  keys: (carrier: MsgHdrs) => [...carrier.keys()],
};

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  logger.info({ subject: SUBJECT }, "Agent démarré");

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    const parentCtx = msg.headers
      ? propagation.extract(context.active(), msg.headers as MsgHdrs, natsGetter)
      : context.active();

    await tracer.startActiveSpan("weather.fetch", {}, parentCtx, async (span) => {
      let result: AgentResponse<WeatherData>;
      try {
        const location = JSON.parse(sc.decode(msg.data)) as GeoLocation;
        span.setAttributes({ "location.name": location.name, "location.lat": location.latitude, "location.lon": location.longitude });
        logger.info({ ...traceCtx(), location: location.name }, "Récupération météo");

        const data = await client.fetch(location);
        span.setAttributes({ "weather.temperature": data.temperature, "weather.rain": data.rainProbability });
        result = { status: "success", output: data };
        logger.info({ ...traceCtx(), temperature: data.temperature, rain: data.rainProbability }, "Météo récupérée");
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
