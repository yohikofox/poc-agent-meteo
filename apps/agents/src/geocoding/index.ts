import "../tracing"; // doit rester en premier
import { connect, StringCodec, headers as natsHeaders } from "nats";
import type { MsgHdrs } from "nats";
import { context, propagation, trace, SpanStatusCode } from "@opentelemetry/api";
import { OpenMeteoGeocodingClient } from "../clients/OpenMeteoGeocodingClient";
import { AgentResponse, GeoLocation } from "../shared/types";
import { logger, traceCtx } from "../shared/logger";

const SUBJECT = "agents.location.resolve";
const sc = StringCodec();
const client = new OpenMeteoGeocodingClient();
const tracer = trace.getTracer("geocoding-agent");

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

    await tracer.startActiveSpan("geocoding.resolve", {}, parentCtx, async (span) => {
      let result: AgentResponse<GeoLocation>;
      try {
        const { name } = JSON.parse(sc.decode(msg.data)) as { name: string };
        span.setAttribute("location.name", name);
        logger.info({ ...traceCtx(), name }, "Résolution");

        const results = await client.search(name);
        result = results.length > 0
          ? { status: "success", output: results[0] }
          : { status: "failed", reason: `Lieu introuvable : ${name}` };

        if (result.status === "failed") span.setStatus({ code: SpanStatusCode.ERROR, message: result.reason });
        else logger.info({ ...traceCtx(), location: result.output?.name }, "Résolu");
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
