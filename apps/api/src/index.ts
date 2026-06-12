import "./tracing"; // doit rester en premier
import "dotenv/config";
import { connect } from "nats";
import { TaskStore } from "./harness/TaskStore";
import { AgentRegistry } from "./registry/AgentRegistry";
import { WeatherReportOrchestrator } from "./orchestrator/WeatherReportOrchestrator";
import { ItinerarySupervisor } from "./supervisor/ItinerarySupervisor";
import { createRoutes } from "./api/routes";
import { createServer } from "./api/server";
import { logger } from "./logger";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const NATS_URL = process.env.NATS_URL ?? "nats://localhost:4222";

async function main() {
  const nc = await connect({ servers: NATS_URL });
  logger.info({ natsUrl: NATS_URL }, "NATS connecté");

  const taskStore = new TaskStore();
  const agentRegistry = new AgentRegistry();
  const orchestrator = new WeatherReportOrchestrator(nc, taskStore);
  const itinerarySupervisor = new ItinerarySupervisor(nc, taskStore);

  const router = createRoutes(orchestrator, itinerarySupervisor, taskStore, agentRegistry);
  const app = createServer(router);

  app.listen(PORT, () => {
    logger.info({ port: PORT }, "API démarrée");
  });

  process.on("SIGTERM", async () => {
    await nc.drain();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, "Erreur fatale");
  process.exit(1);
});
