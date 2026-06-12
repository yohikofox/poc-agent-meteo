import "../tracing";
import { connect, StringCodec } from "nats";
import type { MsgHdrs } from "nats";
import { context, propagation, trace, SpanStatusCode } from "@opentelemetry/api";
import { AgentResponse, ItineraryQualityInput, ItineraryQualityResult } from "../shared/types";
import { logger, traceCtx } from "../shared/logger";

const SUBJECT = "agents.itinerary.report.check";
const sc = StringCodec();
const tracer = trace.getTracer("itinerary-quality-agent");

const natsGetter = {
  get: (carrier: MsgHdrs, key: string) => carrier.get(key) || undefined,
  keys: (carrier: MsgHdrs) => [...carrier.keys()],
};

const REQUIRED_SECTIONS = ["résumé du trajet", "étapes", "points d'attention", "conseils"];

function check(input: ItineraryQualityInput): ItineraryQualityResult {
  const { report, waypoints } = input;
  const lower = report.toLowerCase();
  const details: string[] = [];
  const reasons: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    if (lower.includes(section)) {
      details.push(`✓ section "${section}" présente`);
    } else {
      details.push(`✗ section "${section}" absente`);
      reasons.push(`section "${section}" manquante`);
    }
  }

  for (const wp of waypoints.filter((w) => w.status === "success")) {
    if (lower.includes(wp.name.toLowerCase())) {
      details.push(`✓ étape "${wp.name}" mentionnée`);
    } else {
      details.push(`✗ étape "${wp.name}" absente du rapport`);
      reasons.push(`l'étape "${wp.name}" n'est pas mentionnée`);
    }
  }

  for (const wp of waypoints.filter((w) => w.status === "degraded")) {
    if (lower.includes(wp.name.toLowerCase())) {
      details.push(`✓ étape dégradée "${wp.name}" signalée`);
    } else {
      details.push(`✗ étape dégradée "${wp.name}" non signalée`);
      reasons.push(`l'étape dégradée "${wp.name}" n'est pas signalée`);
    }
  }

  return {
    valid: reasons.length === 0,
    reason: reasons.length > 0 ? reasons.join("; ") : undefined,
    details,
  };
}

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  logger.info({ subject: SUBJECT }, "Agent démarré");

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    const parentCtx = msg.headers
      ? propagation.extract(context.active(), msg.headers as MsgHdrs, natsGetter)
      : context.active();

    await tracer.startActiveSpan("itinerary.quality-check", {}, parentCtx, async (span) => {
      let result: AgentResponse<ItineraryQualityResult>;
      try {
        const input = JSON.parse(sc.decode(msg.data)) as ItineraryQualityInput;
        const qr = check(input);
        span.setAttributes({ "quality.valid": qr.valid, "quality.reason": qr.reason ?? "" });
        result = { status: qr.valid ? "success" : "failed", output: qr, reason: qr.reason };
        if (!qr.valid) span.setStatus({ code: SpanStatusCode.ERROR, message: qr.reason });
        logger.info({ ...traceCtx(), valid: qr.valid, reason: qr.reason }, "Contrôle qualité itinéraire terminé");
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
