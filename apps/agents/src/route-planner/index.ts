import "../tracing";
import { connect, StringCodec } from "nats";
import type { MsgHdrs } from "nats";
import { context, propagation, trace, SpanStatusCode } from "@opentelemetry/api";
import { OllamaClient } from "../clients/OllamaClient";
import { AgentResponse } from "../shared/types";
import { logger, traceCtx } from "../shared/logger";

const SUBJECT = "agents.itinerary.plan";
const sc = StringCodec();
const ollama = new OllamaClient();
const tracer = trace.getTracer("route-planner-agent");

const natsGetter = {
  get: (carrier: MsgHdrs, key: string) => carrier.get(key) || undefined,
  keys: (carrier: MsgHdrs) => [...carrier.keys()],
};

function buildPrompt(from: string, to: string): string {
  return `Tu es un expert en géographie. Donne les villes principales pour un voyage de ${from} à ${to} par la route.

Réponds UNIQUEMENT avec les noms des villes séparés par des virgules, dans l'ordre du trajet.
Inclus "${from}" en premier et "${to}" en dernier. Entre 4 et 8 villes au total.

Exemple pour Paris → Marseille : Paris, Lyon, Valence, Avignon, Marseille

Réponds uniquement avec la liste, sans explication.`;
}

function parseWaypoints(raw: string, from: string, to: string): string[] {
  const cleaned = raw
    .split("\n")[0]
    .replace(/[*_`[\]]/g, "")
    .trim();

  const cities = cleaned
    .split(",")
    .map((s) => s.trim().replace(/^\d+\.\s*/, ""))
    .filter((s) => s.length > 1 && s.length < 50);

  if (cities.length < 2) throw new Error(`Format inattendu : "${raw.slice(0, 100)}"`);

  // Garantir que départ et arrivée sont présents aux bonnes positions
  if (!cities[0].toLowerCase().includes(from.toLowerCase())) cities.unshift(from);
  if (!cities[cities.length - 1].toLowerCase().includes(to.toLowerCase())) cities.push(to);

  return cities.slice(0, 10);
}

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  logger.info({ subject: SUBJECT }, "Agent démarré");

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    const parentCtx = msg.headers
      ? propagation.extract(context.active(), msg.headers as MsgHdrs, natsGetter)
      : context.active();

    await tracer.startActiveSpan("itinerary.plan", {}, parentCtx, async (span) => {
      let result: AgentResponse<string[]>;
      try {
        const { from, to } = JSON.parse(sc.decode(msg.data)) as { from: string; to: string };
        span.setAttributes({ "route.from": from, "route.to": to });
        logger.info({ ...traceCtx(), from, to }, "Planification de l'itinéraire");

        const raw = await ollama.generate(buildPrompt(from, to));
        const waypoints = parseWaypoints(raw, from, to);

        span.setAttribute("waypoints.count", waypoints.length);
        result = { status: "success", output: waypoints };
        logger.info({ ...traceCtx(), waypoints }, "Itinéraire planifié");
      } catch (err) {
        result = { status: "failed", reason: err instanceof Error ? err.message : String(err) };
        span.recordException(err instanceof Error ? err : new Error(result.reason!));
        span.setStatus({ code: SpanStatusCode.ERROR });
        logger.error({ ...traceCtx(), err: result.reason }, "Erreur planification");
      }
      span.end();
      msg.respond(sc.encode(JSON.stringify(result)));
    });
  }
}

main().catch((err) => { logger.error({ err }, "Erreur fatale"); process.exit(1); });
