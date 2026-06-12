import { connect, StringCodec } from "nats";
import { AgentResponse, WeatherData, WeatherRisk } from "../shared/types";

const SUBJECT = "agents.weather.risk";
const sc = StringCodec();

function analyzeRisks(data: WeatherData): WeatherRisk[] {
  const { rainProbability, wind, temperature } = data;
  const risks: WeatherRisk[] = [];

  if (rainProbability > 70) {
    risks.push({ type: "rain", level: "high", description: `Risque de pluie significatif (${rainProbability}%)` });
  } else if (rainProbability > 40) {
    risks.push({ type: "rain", level: "medium", description: `Risque de pluie modéré (${rainProbability}%)` });
  }

  if (wind > 40) {
    risks.push({ type: "wind", level: "high", description: `Vent fort (${wind} km/h)` });
  } else if (wind > 20) {
    risks.push({ type: "wind", level: "low", description: `Vent modéré (${wind} km/h)` });
  }

  if (temperature > 35) {
    risks.push({ type: "heat", level: "high", description: `Forte chaleur (${temperature}°C)` });
  } else if (temperature < 0) {
    risks.push({ type: "frost", level: "high", description: `Gel (${temperature}°C)` });
  } else if (temperature < 5) {
    risks.push({ type: "cold", level: "medium", description: `Froid (${temperature}°C)` });
  }

  return risks;
}

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  console.log(`[weather-risk-agent] connecté — en écoute sur ${SUBJECT}`);

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    let result: AgentResponse<WeatherRisk[]>;
    try {
      const data = JSON.parse(sc.decode(msg.data)) as WeatherData;
      result = { status: "success", output: analyzeRisks(data) };
    } catch (err) {
      result = { status: "failed", reason: err instanceof Error ? err.message : String(err) };
    }
    msg.respond(sc.encode(JSON.stringify(result)));
  }
}

main().catch((err) => { console.error("[weather-risk-agent]", err); process.exit(1); });
