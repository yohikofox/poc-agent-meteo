import { connect, StringCodec } from "nats";
import { OpenMeteoGeocodingClient } from "../clients/OpenMeteoGeocodingClient";
import { AgentResponse, GeoLocation } from "../shared/types";

const SUBJECT = "agents.location.resolve";
const sc = StringCodec();
const client = new OpenMeteoGeocodingClient();

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  console.log(`[geocoding-agent] connecté — en écoute sur ${SUBJECT}`);

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    let result: AgentResponse<GeoLocation>;
    try {
      const { name } = JSON.parse(sc.decode(msg.data)) as { name: string };
      const results = await client.search(name);
      result = results.length > 0
        ? { status: "success", output: results[0] }
        : { status: "failed", reason: `Lieu introuvable : ${name}` };
    } catch (err) {
      result = { status: "failed", reason: err instanceof Error ? err.message : String(err) };
    }
    msg.respond(sc.encode(JSON.stringify(result)));
  }
}

main().catch((err) => { console.error("[geocoding-agent]", err); process.exit(1); });
