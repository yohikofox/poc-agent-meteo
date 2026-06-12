import "../tracing";
import { connect, StringCodec } from "nats";
import type { MsgHdrs } from "nats";
import { context, propagation, trace, SpanStatusCode } from "@opentelemetry/api";
import { OllamaClient } from "../clients/OllamaClient";
import { AgentResponse, ItineraryReportInput } from "../shared/types";
import { logger, traceCtx } from "../shared/logger";

const SUBJECT = "agents.itinerary.report.write";
const sc = StringCodec();
const ollama = new OllamaClient();
const tracer = trace.getTracer("itinerary-report-writer-agent");

const natsGetter = {
  get: (carrier: MsgHdrs, key: string) => carrier.get(key) || undefined,
  keys: (carrier: MsgHdrs) => [...carrier.keys()],
};

function buildPrompt(input: ItineraryReportInput): string {
  const { waypoints, retryReason } = input;

  const waypointLines = waypoints.map((w) => {
    if (w.status === "degraded") {
      return `- ${w.name} : DONNÉES INDISPONIBLES (${w.reason ?? "erreur inconnue"})`;
    }
    const wd = w.weatherData!;
    const risks = (w.risks ?? []).map((r) => r.type).join(", ") || "aucun";
    return `- ${w.name}${w.location?.country ? ` (${w.location.country})` : ""} : ${wd.temperature}°C, pluie ${wd.rainProbability}%, vent ${wd.wind} km/h, humidité ${wd.humidity}% — risques : ${risks}`;
  }).join("\n");

  const correction = retryReason
    ? `\n\nCORRECTION REQUISE : ${retryReason}. Assure-toi de corriger ce problème.\n`
    : "";

  return `Tu es un météorologue spécialiste des itinéraires de voyage. Génère un bulletin météo de voyage en français avec EXACTEMENT ces 4 sections :

## Résumé du trajet
## Étapes
## Points d'attention
## Conseils
${correction}
Étapes du voyage (dans l'ordre) :
${waypointLines}

RÈGLES STRICTES :
- Utilise UNIQUEMENT les données fournies ci-dessus.
- Dans "Étapes", mentionne CHAQUE étape listée dans l'ordre, avec ses données météo.
- Pour les étapes "DONNÉES INDISPONIBLES", signale-les explicitement dans "Points d'attention".
- N'invente aucune donnée absente (UV, pression, orages, neige, etc.).
- "Conseils" doit contenir au moins 2 conseils pratiques adaptés au voyage.`;
}

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  logger.info({ subject: SUBJECT }, "Agent démarré");

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    const parentCtx = msg.headers
      ? propagation.extract(context.active(), msg.headers as MsgHdrs, natsGetter)
      : context.active();

    await tracer.startActiveSpan("itinerary.report.write", {}, parentCtx, async (span) => {
      let result: AgentResponse<string>;
      try {
        const input = JSON.parse(sc.decode(msg.data)) as ItineraryReportInput;
        const degradedCount = input.waypoints.filter((w) => w.status === "degraded").length;
        span.setAttributes({
          "waypoints.total": input.waypoints.length,
          "waypoints.degraded": degradedCount,
          "is.retry": !!input.retryReason,
        });
        logger.info({ ...traceCtx(), waypointCount: input.waypoints.length, degradedCount, isRetry: !!input.retryReason }, "Génération rapport itinéraire");

        const report = await ollama.generate(buildPrompt(input));
        span.setAttribute("report.length", report.length);
        result = { status: "success", output: report };
        logger.info({ ...traceCtx(), reportLength: report.length }, "Rapport itinéraire généré");
      } catch (err) {
        result = { status: "failed", reason: err instanceof Error ? err.message : String(err) };
        span.recordException(err instanceof Error ? err : new Error(result.reason!));
        span.setStatus({ code: SpanStatusCode.ERROR });
        logger.error({ ...traceCtx(), err: result.reason }, "Erreur Ollama");
      }
      span.end();
      msg.respond(sc.encode(JSON.stringify(result)));
    });
  }
}

main().catch((err) => { logger.error({ err }, "Erreur fatale"); process.exit(1); });
