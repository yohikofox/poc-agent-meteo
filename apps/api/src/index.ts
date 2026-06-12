import "dotenv/config";
import { connect } from "nats";
import { TaskStore } from "./harness/TaskStore";
import { AgentRegistry } from "./registry/AgentRegistry";
import { WeatherReportSupervisor } from "./supervisor/WeatherReportSupervisor";
import { createRoutes } from "./api/routes";
import { createServer } from "./api/server";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const NATS_URL = process.env.NATS_URL ?? "nats://localhost:4222";

async function main() {
  const nc = await connect({ servers: NATS_URL });
  console.log(`NATS connecté : ${NATS_URL}`);

  const taskStore = new TaskStore();
  const agentRegistry = new AgentRegistry();
  const supervisor = new WeatherReportSupervisor(nc, taskStore);

  const router = createRoutes(supervisor, taskStore, agentRegistry);
  const app = createServer(router);

  app.listen(PORT, () => {
    console.log(`API démarrée sur http://localhost:${PORT}`);
    console.log(`Routes : POST /weather-report · GET /agents · GET /tasks/:id/events`);
  });

  process.on("SIGTERM", async () => {
    await nc.drain();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
