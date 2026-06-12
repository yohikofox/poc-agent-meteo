import "../tracing";
import { connect, StringCodec } from "nats";
import type { MsgHdrs } from "nats";
import { context, propagation, trace, SpanStatusCode } from "@opentelemetry/api";
import { OllamaClient } from "../clients/OllamaClient";
import { AgentResponse } from "../shared/types";
import { logger, traceCtx } from "../shared/logger";

const SUBJECT = "agents.weather.plan";
const sc = StringCodec();
const ollama = new OllamaClient();
const tracer = trace.getTracer("weather-planner-agent");

const natsGetter = {
  get: (carrier: MsgHdrs, key: string) => carrier.get(key) || undefined,
  keys: (carrier: MsgHdrs) => [...carrier.keys()],
};

export type WeatherIntent =
  | { type: "weather-report"; location: string }
  | { type: "itinerary"; from: string; to: string };

export interface WeatherPlan {
  explanation: string;
  intents: WeatherIntent[];
}

function buildPrompt(question: string): string {
  return `Tu es un assistant spécialisé en météo. Analyse la question et extrais les intentions météo.

QUESTION : "${question}"

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni balises, avec cette structure exacte :
{
  "explanation": "Ce que l'utilisateur veut savoir (1-2 phrases en français)",
  "intents": [
    { "type": "weather-report", "location": "NomVille" },
    { "type": "itinerary", "from": "VilleDepart", "to": "VilleArrivee" }
  ]
}

Règles strictes :
- Si la question mentionne un trajet, un voyage ou un itinéraire entre deux villes → type "itinerary"
- Si la question mentionne une ou plusieurs villes isolées → type "weather-report" pour chacune
- Maximum 3 intentions au total
- Noms de villes en français si possible
- Réponds UNIQUEMENT avec le JSON, aucun autre texte avant ou après`;
}

function parsePlan(raw: string): WeatherPlan {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Réponse LLM non parseable : "${trimmed.slice(0, 200)}"`);

  const parsed = JSON.parse(jsonMatch[0]) as Partial<WeatherPlan>;
  if (!parsed.explanation || !Array.isArray(parsed.intents) || parsed.intents.length === 0) {
    throw new Error("Plan incomplet : explanation ou intents manquants");
  }

  const intents = parsed.intents
    .filter((i) => i.type === "weather-report" || i.type === "itinerary")
    .slice(0, 3);

  if (intents.length === 0) throw new Error("Aucune intention reconnue dans le plan");

  return { explanation: parsed.explanation, intents };
}

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  logger.info({ subject: SUBJECT }, "Agent démarré");

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    const parentCtx = msg.headers
      ? propagation.extract(context.active(), msg.headers as MsgHdrs, natsGetter)
      : context.active();

    await tracer.startActiveSpan("weather.plan", {}, parentCtx, async (span) => {
      let result: AgentResponse<WeatherPlan>;
      try {
        const { question } = JSON.parse(sc.decode(msg.data)) as { question: string };
        span.setAttribute("question", question);
        logger.info({ ...traceCtx(), question }, "Planification de la question météo");

        const raw = await ollama.generate(buildPrompt(question));
        const plan = parsePlan(raw);

        span.setAttribute("intents.count", plan.intents.length);
        result = { status: "success", output: plan };
        logger.info({ ...traceCtx(), intents: plan.intents }, "Plan météo extrait");
      } catch (err) {
        result = { status: "failed", reason: err instanceof Error ? err.message : String(err) };
        span.recordException(err instanceof Error ? err : new Error(result.reason!));
        span.setStatus({ code: SpanStatusCode.ERROR });
        logger.error({ ...traceCtx(), err: result.reason }, "Erreur planification météo");
      }
      span.end();
      msg.respond(sc.encode(JSON.stringify(result)));
    });
  }
}

main().catch((err) => { logger.error({ err }, "Erreur fatale"); process.exit(1); });
