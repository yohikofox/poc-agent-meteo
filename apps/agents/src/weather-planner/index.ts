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

interface PlannerIntent {
  type: string;
  label: string;
  description: string;
  inputSchema: string;
  example: string;
}

export type WeatherIntent =
  | { type: "weather-report"; location: string }
  | { type: "itinerary"; from: string; to: string };

export interface WeatherPlan {
  explanation: string;
  intents: WeatherIntent[];
}

function buildPrompt(question: string, intents: PlannerIntent[]): string {
  const intentList = intents
    .map((i) => `- type "${i.type}" : ${i.description}\n  paramètres requis : ${i.inputSchema}\n  exemple : "${i.example}"`)
    .join("\n\n");

  const typeList = intents.map((i) => `"${i.type}"`).join(" ou ");

  return `Tu es un assistant spécialisé en météo. Tu as accès aux fonctionnalités suivantes :

${intentList}

Analyse la question et sélectionne les fonctionnalités appropriées parmi celles listées ci-dessus.

QUESTION : "${question}"

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni balises :
{
  "explanation": "Ce que l'utilisateur veut savoir (1-2 phrases en français)",
  "intents": [
    // utilise UNIQUEMENT les types : ${typeList}
  ]
}

Règles strictes :
- Utilise UNIQUEMENT les types listés ci-dessus
- Maximum 3 intentions au total
- Noms de villes en français si possible
- Réponds UNIQUEMENT avec le JSON, aucun autre texte`;
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
        const { question, intents = [] } = JSON.parse(sc.decode(msg.data)) as { question: string; intents?: PlannerIntent[] };
        span.setAttribute("question", question);
        span.setAttribute("intents.available", intents.map((i) => i.type).join(","));
        logger.info({ ...traceCtx(), question, availableIntents: intents.map((i) => i.type) }, "Planification de la question météo");

        const raw = await ollama.generate(buildPrompt(question, intents));
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
