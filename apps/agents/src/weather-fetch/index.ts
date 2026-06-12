import { connect, StringCodec } from "nats";
import { OpenMeteoForecastClient } from "../clients/OpenMeteoForecastClient";
import { AgentResponse, GeoLocation, WeatherData } from "../shared/types";

const SUBJECT = "agents.weather.fetch";
const sc = StringCodec();
const client = new OpenMeteoForecastClient();

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  console.log(`[weather-fetch-agent] connecté — en écoute sur ${SUBJECT}`);

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    let result: AgentResponse<WeatherData>;
    try {
      const location = JSON.parse(sc.decode(msg.data)) as GeoLocation;
      const data = await client.fetch(location);
      result = { status: "success", output: data };
    } catch (err) {
      result = { status: "failed", reason: err instanceof Error ? err.message : String(err) };
    }
    msg.respond(sc.encode(JSON.stringify(result)));
  }
}

main().catch((err) => { console.error("[weather-fetch-agent]", err); process.exit(1); });
