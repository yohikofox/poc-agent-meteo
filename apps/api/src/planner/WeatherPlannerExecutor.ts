import { NatsConnection, StringCodec, headers as natsHeaders } from "nats";
import type { MsgHdrs } from "nats";
import { context, propagation, trace, SpanStatusCode } from "@opentelemetry/api";
import { TaskStore } from "../harness/TaskStore";
import { TaskEvent } from "../types/task";
import { WeatherReportOrchestrator, WeatherReportOutput } from "../orchestrator/WeatherReportOrchestrator";
import { ItinerarySupervisor, ItineraryOutput } from "../supervisor/ItinerarySupervisor";
import { logger, traceCtx } from "../logger";

interface AgentResponse<T = unknown> {
  status: "success" | "failed";
  output?: T;
  reason?: string;
}

export type WeatherIntent =
  | { type: "weather-report"; location: string }
  | { type: "itinerary"; from: string; to: string };

export interface WeatherPlan {
  explanation: string;
  intents: WeatherIntent[];
}

export interface IntentResult {
  intent: WeatherIntent;
  status: "success" | "failed";
  output?: WeatherReportOutput | ItineraryOutput;
  reason?: string;
}

export interface AskOutput {
  question: string;
  plan: WeatherPlan;
  results: IntentResult[];
  traceId: string;
}

const tracer = trace.getTracer("weather-planner-executor");

const natsHeaderSetter = {
  set: (carrier: MsgHdrs, key: string, value: string) => carrier.set(key, value),
};

export class WeatherPlannerExecutor {
  private sc = StringCodec();

  constructor(
    private nc: NatsConnection,
    private taskStore: TaskStore,
    private orchestrator: WeatherReportOrchestrator,
    private supervisor: ItinerarySupervisor
  ) {}

  private pushEvent(taskId: string, type: TaskEvent["type"], message: string, output?: unknown, source: TaskEvent["source"] = "planner") {
    this.taskStore.addEvent(taskId, {
      timestamp: new Date().toISOString(),
      agentId: "weather-planner",
      type,
      message,
      output,
      source,
    });
  }

  private async callPlannerAgent(question: string, taskId: string): Promise<WeatherPlan> {
    return tracer.startActiveSpan("nats.request agents.weather.plan", async (span) => {
      span.setAttributes({ question, "task.id": taskId });
      this.pushEvent(taskId, "started", "Analyse de la question par le planificateur LLM");

      try {
        const h = natsHeaders();
        propagation.inject(context.active(), h, natsHeaderSetter);

        const msg = await this.nc.request(
          "agents.weather.plan",
          this.sc.encode(JSON.stringify({ question })),
          { headers: h, timeout: 30_000 }
        );
        const result = JSON.parse(this.sc.decode(msg.data)) as AgentResponse<WeatherPlan>;

        if (result.status !== "success" || !result.output) {
          throw new Error(result.reason ?? "Planification échouée");
        }

        span.setAttribute("intents.count", result.output.intents.length);
        this.pushEvent(taskId, "completed", "Plan extrait", result.output);
        span.end();
        return result.output;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.pushEvent(taskId, "failed", message);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        span.end();
        throw err;
      }
    });
  }

  private intentLabel(intent: WeatherIntent): string {
    if (intent.type === "weather-report") return `rapport météo pour ${intent.location}`;
    return `itinéraire ${intent.from} → ${intent.to}`;
  }

  private async executeIntent(intent: WeatherIntent, taskId: string, traceId: string): Promise<IntentResult> {
    try {
      if (intent.type === "weather-report") {
        const output = await this.orchestrator.run({ location: intent.location }, taskId, traceId);
        return { intent, status: "success", output };
      } else {
        const output = await this.supervisor.run({ from: intent.from, to: intent.to }, taskId, traceId);
        return { intent, status: "success", output };
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { intent, status: "failed", reason };
    }
  }

  async run(question: string, taskId: string, traceId: string): Promise<AskOutput> {
    return tracer.startActiveSpan("planner.run", async (span) => {
      span.setAttributes({ question, "task.id": taskId });
      logger.info({ ...traceCtx(), question, taskId }, "Exécution planifiée démarrée");

      try {
        const plan = await this.callPlannerAgent(question, taskId);

        this.pushEvent(taskId, "decision",
          `Plan LLM : ${plan.intents.length} intention(s) identifiée(s) — ${plan.intents.map((i) => this.intentLabel(i)).join(", ")}`,
          { explanation: plan.explanation, intents: plan.intents, strategy: "parallel-allSettled" }
        );

        logger.info({ ...traceCtx(), intents: plan.intents }, "Plan météo — exécution parallèle");

        const settled = await Promise.allSettled(
          plan.intents.map((intent) => this.executeIntent(intent, taskId, traceId))
        );

        const results: IntentResult[] = settled.map((s, i) => {
          if (s.status === "fulfilled") return s.value;
          const intent = plan.intents[i];
          const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
          return { intent, status: "failed" as const, reason };
        });

        const failed = results.filter((r) => r.status === "failed").length;
        this.pushEvent(taskId, "decision",
          failed === 0
            ? `Toutes les intentions exécutées avec succès (${results.length}/${results.length})`
            : `${results.length - failed}/${results.length} intention(s) réussie(s) — ${failed} échouée(s)`,
          { total: results.length, failed }
        );

        logger.info({ ...traceCtx(), total: results.length, failed, taskId }, "Exécution planifiée terminée");
        span.end();

        return { question, plan, results, traceId };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        span.recordException(err instanceof Error ? err : new Error(message));
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        span.end();
        throw err;
      }
    });
  }
}
