import { NatsConnection, StringCodec } from "nats";
import { TaskStore } from "../harness/TaskStore";
import { TaskEvent } from "../types/task";

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

export class WeatherReportSupervisor {
  private sc = StringCodec();

  constructor(private nc: NatsConnection, private taskStore: TaskStore) {}

  private async request<T>(
    taskId: string,
    agentId: string,
    agentName: string,
    subject: string,
    payload: unknown
  ): Promise<AgentResponse<T>> {
    this.pushEvent(taskId, agentId, "started", `${agentName} démarré`);

    try {
      const msg = await this.nc.request(
        subject,
        this.sc.encode(JSON.stringify(payload)),
        { timeout: 30_000 }
      );
      const result = JSON.parse(this.sc.decode(msg.data)) as AgentResponse<T>;

      this.pushEvent(
        taskId, agentId,
        result.status === "success" ? "completed" : "failed",
        result.reason ?? `${agentName} terminé`,
        result.output
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.pushEvent(taskId, agentId, "failed", message);
      throw new Error(`${agentName} — ${message}`);
    }
  }

  private pushEvent(
    taskId: string,
    agentId: string,
    type: TaskEvent["type"],
    message: string,
    output?: unknown
  ) {
    this.taskStore.addEvent(taskId, {
      timestamp: new Date().toISOString(),
      agentId,
      type,
      message,
      output,
    });
  }

  async run(
    input: { location: string },
    taskId: string,
    traceId: string
  ): Promise<WeatherReportOutput> {
    // 1. Résoudre la localisation
    const geoResult = await this.request<GeoLocation>(
      taskId, "geocoding-agent", "Geocoding Agent",
      "agents.location.resolve", { name: input.location }
    );
    if (geoResult.status !== "success" || !geoResult.output) {
      throw new Error(geoResult.reason ?? "Géocodage échoué");
    }

    // 2. Récupérer la météo
    const weatherResult = await this.request<WeatherData>(
      taskId, "weather-fetch-agent", "Weather Fetch Agent",
      "agents.weather.fetch", geoResult.output
    );
    if (weatherResult.status !== "success" || !weatherResult.output) {
      throw new Error(weatherResult.reason ?? "Récupération météo échouée");
    }

    // 3. Analyser les risques
    const riskResult = await this.request<WeatherRisk[]>(
      taskId, "weather-risk-analysis-agent", "Weather Risk Analysis Agent",
      "agents.weather.risk", weatherResult.output
    );

    // 4. Générer le rapport
    const reportResult = await this.request<string>(
      taskId, "weather-report-writer-agent", "Weather Report Writer Agent",
      "agents.report.write", weatherResult.output
    );
    if (reportResult.status !== "success" || !reportResult.output) {
      throw new Error(reportResult.reason ?? "Génération du rapport échouée");
    }

    // 5. Contrôle qualité
    await this.request(
      taskId, "quality-check-agent", "Quality Check Agent",
      "agents.report.check", reportResult.output
    );

    const { temperature, rainProbability, wind, humidity } = weatherResult.output;
    return {
      location: geoResult.output,
      weatherData: { temperature, rainProbability, wind, humidity },
      report: reportResult.output,
      risks: (riskResult.output ?? []).map((r) => r.type),
      traceId,
    };
  }
}
