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

interface ItineraryQualityResult {
  valid: boolean;
  reason?: string;
  details: string[];
}

export interface WaypointResult {
  name: string;
  status: "success" | "degraded";
  location?: GeoLocation;
  weatherData?: { temperature: number; rainProbability: number; wind: number; humidity: number };
  risks?: string[];
  reason?: string;
}

export interface ItineraryOutput {
  from: string;
  to: string;
  waypoints: WaypointResult[];
  report: string;
  degraded: string[];
  qualityPassed: boolean;
  traceId: string;
}

const MAX_QUALITY_RETRIES = 3;
const tracer = trace.getTracer("itinerary-supervisor");

const natsHeaderSetter = {
  set: (carrier: MsgHdrs, key: string, value: string) => carrier.set(key, value),
};

export class ItinerarySupervisor {
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

  private decide(taskId: string, message: string, output?: unknown) {
    this.pushEvent(taskId, "itinerary-supervisor", "decision", message, output, "supervisor");
  }

  private async processWaypoint(taskId: string, name: string): Promise<WaypointResult> {
    const geoResult = await this.request<GeoLocation>(
      taskId, "geocoding-agent", "Geocoding Agent", "agents.location.resolve", { name }
    );
    if (geoResult.status !== "success" || !geoResult.output) {
      throw new Error(geoResult.reason ?? "Géocodage échoué");
    }

    const weatherResult = await this.request<WeatherData>(
      taskId, "weather-fetch-agent", "Weather Fetch Agent", "agents.weather.fetch", geoResult.output
    );
    if (weatherResult.status !== "success" || !weatherResult.output) {
      throw new Error(weatherResult.reason ?? "Météo indisponible");
    }

    const riskResult = await this.request<WeatherRisk[]>(
      taskId, "weather-risk-analysis-agent", "Weather Risk Analysis Agent", "agents.weather.risk", weatherResult.output
    );

    const { temperature, rainProbability, wind, humidity } = weatherResult.output;
    return {
      name,
      status: "success",
      location: geoResult.output,
      weatherData: { temperature, rainProbability, wind, humidity },
      risks: (riskResult.output ?? []).map((r) => r.type),
    };
  }

  async run(input: { from: string; to: string }, taskId: string, traceId: string): Promise<ItineraryOutput> {
    return tracer.startActiveSpan("itinerary.run", async (span) => {
      span.setAttributes({ "route.from": input.from, "route.to": input.to, "task.id": taskId });
      logger.info({ ...traceCtx(), from: input.from, to: input.to, taskId }, "Itinéraire météo démarré");

      try {
        // 1. Planifier l'itinéraire via le route-planner-agent (LLM)
        const planResult = await this.request<string[]>(
          taskId, "route-planner-agent", "Route Planner", "agents.itinerary.plan",
          { from: input.from, to: input.to }
        );
        if (planResult.status !== "success" || !planResult.output?.length) {
          throw new Error(planResult.reason ?? "Planification de l'itinéraire échouée");
        }
        const waypoints = planResult.output;
        span.setAttribute("waypoints.count", waypoints.length);
        logger.info({ ...traceCtx(), waypoints }, "Itinéraire planifié");

        this.decide(taskId,
          `Itinéraire planifié par LLM : ${waypoints.join(" → ")}`,
          { waypoints, strategy: "parallel-allSettled-with-retry" }
        );

        // 2. Traiter tous les waypoints en parallèle — allSettled ne fail-fast pas
        const settled = await Promise.allSettled(
          waypoints.map((name) => this.processWaypoint(taskId, name))
        );

        // 3. Retry unique par waypoint échoué, puis marquer dégradé
        const waypointResults: WaypointResult[] = await Promise.all(
          settled.map(async (result, i) => {
            if (result.status === "fulfilled") return result.value;

            const name = waypoints[i];
            const initialReason = result.reason instanceof Error ? result.reason.message : String(result.reason);
            logger.warn({ ...traceCtx(), waypoint: name, err: initialReason }, "Waypoint échoué — retry");
            this.pushEvent(taskId, "itinerary-supervisor", "retry",
              `Waypoint « ${name} » échoué — nouvelle tentative`,
              { waypoint: name, reason: initialReason },
              "supervisor"
            );

            try {
              return await this.processWaypoint(taskId, name);
            } catch (err) {
              const reason = err instanceof Error ? err.message : String(err);
              logger.error({ ...traceCtx(), waypoint: name, err: reason }, "Waypoint dégradé après retry");
              this.pushEvent(taskId, "itinerary-supervisor", "degraded",
                `Waypoint « ${name} » dégradé après retry — exclu du rapport`,
                { waypoint: name, reason },
                "supervisor"
              );
              return { name, status: "degraded" as const, reason };
            }
          })
        );

        const degraded = waypointResults.filter((w) => w.status === "degraded").map((w) => w.name);
        span.setAttribute("waypoints.degraded", degraded.length);

        if (degraded.length > 0) {
          this.decide(taskId,
            `${degraded.length} waypoint(s) dégradé(s) : ${degraded.join(", ")} — rapport généré avec données partielles`,
            { degraded, total: waypoints.length }
          );
        }

        // 4. Boucle supervisée : génération + contrôle qualité + retry avec correction injectée
        let report = "";
        let qualityPassed = false;
        let retryReason: string | undefined;

        for (let attempt = 0; attempt < MAX_QUALITY_RETRIES; attempt++) {
          if (attempt > 0) {
            logger.warn({ ...traceCtx(), attempt, retryReason }, "Qualité insuffisante — retry rapport avec correction");
            this.pushEvent(taskId, "itinerary-supervisor", "retry",
              `Qualité insuffisante (tentative ${attempt}/${MAX_QUALITY_RETRIES}) — rapport régénéré avec correction injectée`,
              { attempt, retryReason },
              "supervisor"
            );
          }

          const reportResult = await this.request<string>(
            taskId,
            "itinerary-report-writer-agent",
            "Itinerary Report Writer",
            "agents.itinerary.report.write",
            { waypoints: waypointResults, retryReason }
          );

          if (reportResult.status !== "success" || !reportResult.output) {
            logger.error({ ...traceCtx(), attempt }, "Génération rapport impossible");
            break;
          }
          report = reportResult.output;

          const qualityResult = await this.request<ItineraryQualityResult>(
            taskId,
            "itinerary-quality-agent",
            "Itinerary Quality Agent",
            "agents.itinerary.report.check",
            { report, waypoints: waypointResults }
          );

          if (qualityResult.output?.valid) {
            qualityPassed = true;
            this.decide(taskId,
              `Qualité validée à la tentative ${attempt + 1}/${MAX_QUALITY_RETRIES} — rapport accepté`,
              { attempt: attempt + 1, details: qualityResult.output?.details }
            );
            break;
          }

          retryReason = qualityResult.output?.reason;
        }

        if (!qualityPassed && report) {
          logger.warn({ ...traceCtx() }, "Rapport retourné sans validation qualité après 3 tentatives");
          this.decide(taskId,
            `Qualité non validée après ${MAX_QUALITY_RETRIES} tentatives — rapport retourné en l'état`,
            { maxRetries: MAX_QUALITY_RETRIES, lastReason: retryReason }
          );
        }

        logger.info({ ...traceCtx(), from: input.from, to: input.to, total: waypoints.length, degraded: degraded.length, qualityPassed, taskId }, "Itinéraire météo terminé");
        span.end();

        return { from: input.from, to: input.to, waypoints: waypointResults, report, degraded, qualityPassed, traceId };
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
