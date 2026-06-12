import "../tracing";
import { connect, StringCodec } from "nats";
import type { MsgHdrs } from "nats";
import { context, propagation, trace, SpanStatusCode } from "@opentelemetry/api";
import { OllamaClient } from "../clients/OllamaClient";
import { AgentResponse, WeatherData } from "../shared/types";
import { logger, traceCtx } from "../shared/logger";

const SUBJECT = "agents.report.write";
const sc = StringCodec();
const ollama = new OllamaClient();
const tracer = trace.getTracer("report-writer-agent");

const natsGetter = {
  get: (carrier: MsgHdrs, key: string) => carrier.get(key) || undefined,
  keys: (carrier: MsgHdrs) => [...carrier.keys()],
};

function buildPrompt(data: WeatherData): string {
  const { location, temperature, rainProbability, wind, humidity } = data;
  return `Tu es un météorologue factuel. Génère un rapport météo concis en français pour ${location.name} avec EXACTEMENT ces 4 sections :

## Résumé
## Conditions actuelles
## Risques
## Conseils

Données disponibles (utilise UNIQUEMENT ces données) :
- Température : ${temperature}°C
- Probabilité de pluie : ${rainProbability}%
- Vent : ${wind} km/h
- Humidité : ${humidity}%

INTERDIT : tu ne dois jamais inventer ni déduire des données absentes. Ne mentionne PAS : UV, pression atmosphérique, orages, neige, qualité de l'air, ensoleillement, nébulosité, ni aucun autre paramètre absent de la liste ci-dessus.

OBLIGATOIRE dans la section Risques :
- Mentionner un risque de pluie significatif si probabilité de pluie > 70%.
- Mentionner un vent fort ou des rafales si vent > 40 km/h.`;
}

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  logger.info({ subject: SUBJECT, ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434" }, "Agent démarré");

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    const parentCtx = msg.headers
      ? propagation.extract(context.active(), msg.headers as MsgHdrs, natsGetter)
      : context.active();

    await tracer.startActiveSpan("report.write", {}, parentCtx, async (span) => {
      let result: AgentResponse<string>;
      try {
        const data = JSON.parse(sc.decode(msg.data)) as WeatherData;
        span.setAttribute("location.name", data.location.name);
        logger.info({ ...traceCtx(), location: data.location.name }, "Génération du rapport Ollama");

        const report = await ollama.generate(buildPrompt(data));
        span.setAttribute("report.length", report.length);
        result = { status: "success", output: report };
        logger.info({ ...traceCtx(), reportLength: report.length }, "Rapport généré");
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
