import { connect, StringCodec } from "nats";
import { OllamaClient } from "../clients/OllamaClient";
import { AgentResponse, WeatherData } from "../shared/types";

const SUBJECT = "agents.report.write";
const sc = StringCodec();
const ollama = new OllamaClient();

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
  console.log(`[report-writer-agent] connecté — en écoute sur ${SUBJECT}`);
  console.log(`Ollama : ${process.env.OLLAMA_URL ?? "http://localhost:11434"} / ${process.env.OLLAMA_MODEL ?? "llama3.2:3b"}`);

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    let result: AgentResponse<string>;
    try {
      const data = JSON.parse(sc.decode(msg.data)) as WeatherData;
      const report = await ollama.generate(buildPrompt(data));
      result = { status: "success", output: report };
    } catch (err) {
      result = { status: "failed", reason: err instanceof Error ? err.message : String(err) };
    }
    msg.respond(sc.encode(JSON.stringify(result)));
  }
}

main().catch((err) => { console.error("[report-writer-agent]", err); process.exit(1); });
