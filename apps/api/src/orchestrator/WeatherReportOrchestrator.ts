import { NatsConnection, StringCodec, headers as natsHeaders } from "nats";
import type { MsgHdrs } from "nats";
import { context, propagation, trace, SpanStatusCode } from "@opentelemetry/api";
import { TaskStore } from "../harness/TaskStore";
import { TaskEvent } from "../types/task";
import { logger, traceCtx } from "../logger";

interface AgentResponse<T = unknown> {
  status: "success" | "failed";
  output?: T;
  reason?: string;
}

interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
}

interface WeatherData {
  location: GeoLocation;
  temperature: number;
  rainProbability: number;
  wind: number;
  humidity: number;
}

interface WeatherRisk {
  type: string;
  level: string;
  description: string;
}

export interface WeatherReportOutput {
  location: GeoLocation;
  weatherData: { temperature: number; rainProbability: number; wind: number; humidity: number };
  report: string;
  risks: string[];
  traceId: string;
}

const tracer = trace.getTracer("orchestrator");

const natsHeaderSetter = {
  set: (carrier: MsgHdrs, key: string, value: string) => carrier.set(key, value),
};

export class WeatherReportOrchestrator {
  private sc = StringCodec();

  constructor(private nc: NatsConnection, private taskStore: TaskStore) {}

  private async request<T>(
    taskId: string,
    agentId: string,
    agentName: string,
    subject: string,
    payload: unknown
  ): Promise<AgentResponse<T>> {
    return tracer.startActiveSpan(`nats.request ${subject}`, async (span) => {
      span.setAttributes({ "nats.subject": subject, "agent.id": agentId, "task.id": taskId });
      this.pushEvent(taskId, agentId, "started", `${agentName} démarré`);

      try {
        // Propager le contexte de trace dans les headers NATS
        const h = natsHeaders();
        propagation.inject(context.active(), h, natsHeaderSetter);

        const msg = await this.nc.request(
          subject,
          this.sc.encode(JSON.stringify(payload)),
          { headers: h, timeout: 30_000 }
        );
        const result = JSON.parse(this.sc.decode(msg.data)) as AgentResponse<T>;

        if (result.status === "failed") {
          span.setStatus({ code: SpanStatusCode.ERROR, message: result.reason });
          logger.warn({ ...traceCtx(), agentId, reason: result.reason }, `${agentName} échoué`);
        } else {
          logger.info({ ...traceCtx(), agentId }, `${agentName} terminé`);
        }

        this.pushEvent(
          taskId, agentId,
          result.status === "success" ? "completed" : "failed",
          result.reason ?? `${agentName} terminé`,
          result.output
        );
        span.end();
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        span.recordException(err instanceof Error ? err : new Error(message));
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        span.end();
        logger.error({ ...traceCtx(), agentId, err: message }, `${agentName} erreur`);
        this.pushEvent(taskId, agentId, "failed", message);
        throw new Error(`${agentName} — ${message}`);
      }
    });
  }

  private pushEvent(taskId: string, agentId: string, type: TaskEvent["type"], message: string, output?: unknown, source: TaskEvent["source"] = "agent") {
    this.taskStore.addEvent(taskId, { timestamp: new Date().toISOString(), agentId, type, message, output, source });
  }

  async run(input: { location: string }, taskId: string, traceId: string): Promise<WeatherReportOutput> {
    return tracer.startActiveSpan("weather-report.run", async (span) => {
      span.setAttributes({ "location": input.location, "task.id": taskId });
      logger.info({ ...traceCtx(), location: input.location, taskId }, "Rapport météo démarré");

      try {
        this.pushEvent(
          taskId, "weather-orchestrator", "decision",
          "Pipeline séquentiel démarré : geocoding → weather-fetch → risk → report-writer → quality-check",
          { location: input.location, sequence: ["geocoding-agent", "weather-fetch-agent", "weather-risk-analysis-agent", "weather-report-writer-agent", "quality-check-agent"] },
          "orchestrator"
        );

        const geoResult = await this.request<GeoLocation>(
          taskId, "geocoding-agent", "Geocoding Agent", "agents.location.resolve", { name: input.location }
        );
        if (geoResult.status !== "success" || !geoResult.output) throw new Error(geoResult.reason ?? "Géocodage échoué");

        const weatherResult = await this.request<WeatherData>(
          taskId, "weather-fetch-agent", "Weather Fetch Agent", "agents.weather.fetch", geoResult.output
        );
        if (weatherResult.status !== "success" || !weatherResult.output) throw new Error(weatherResult.reason ?? "Récupération météo échouée");

        const riskResult = await this.request<WeatherRisk[]>(
          taskId, "weather-risk-analysis-agent", "Weather Risk Analysis Agent", "agents.weather.risk", weatherResult.output
        );

        const reportResult = await this.request<string>(
          taskId, "weather-report-writer-agent", "Weather Report Writer Agent", "agents.report.write", weatherResult.output
        );
        if (reportResult.status !== "success" || !reportResult.output) throw new Error(reportResult.reason ?? "Génération du rapport échouée");

        const qualityResult = await this.request<{ passed: boolean; score: number; details: string[] }>(
          taskId, "quality-check-agent", "Quality Check Agent", "agents.report.check", reportResult.output
        );
        this.pushEvent(
          taskId, "weather-orchestrator", "decision",
          qualityResult.output?.passed
            ? `Contrôle qualité : ${qualityResult.output.score}/4 sections — rapport accepté`
            : `Contrôle qualité : ${qualityResult.output?.score ?? "?"}/4 sections — rapport retourné sans correction (orchestrateur déterministe)`,
          { score: qualityResult.output?.score, details: qualityResult.output?.details },
          "orchestrator"
        );

        logger.info({ ...traceCtx(), location: input.location, taskId }, "Rapport météo terminé");
        span.end();

        const { temperature, rainProbability, wind, humidity } = weatherResult.output;
        return {
          location: geoResult.output,
          weatherData: { temperature, rainProbability, wind, humidity },
          report: reportResult.output,
          risks: (riskResult.output ?? []).map((r) => r.type),
          traceId,
        };
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
