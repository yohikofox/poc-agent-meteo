import Router from "@koa/router";
import { WeatherReportOrchestrator } from "../orchestrator/WeatherReportOrchestrator";
import { ItinerarySupervisor } from "../supervisor/ItinerarySupervisor";
import { TaskStore } from "../harness/TaskStore";
import { AgentRegistry } from "../registry/AgentRegistry";

export function createRoutes(
  orchestrator: WeatherReportOrchestrator,
  itinerarySupervisor: ItinerarySupervisor,
  taskStore: TaskStore,
  agentRegistry: AgentRegistry
): Router {
  const router = new Router();

  router.post("/weather-report", async (ctx) => {
    const body = ctx.request.body as { location?: string };
    if (!body.location) {
      ctx.status = 400;
      ctx.body = { error: "Le champ 'location' est requis" };
      return;
    }

    const traceId = crypto.randomUUID();
    const task = taskStore.create({ location: body.location });

    try {
      const output = await orchestrator.run({ location: body.location }, task.taskId, traceId);
      taskStore.complete(task.taskId, output);
      ctx.body = { taskId: task.taskId, ...output };
    } catch (error) {
      taskStore.fail(task.taskId);
      ctx.status = 500;
      ctx.body = {
        error: error instanceof Error ? error.message : String(error),
        taskId: task.taskId,
      };
    }
  });

  router.post("/weather-itinerary", async (ctx) => {
    const body = ctx.request.body as { waypoints?: string[] };
    if (!body.waypoints || body.waypoints.length < 2) {
      ctx.status = 400;
      ctx.body = { error: "Au moins 2 waypoints sont requis" };
      return;
    }
    if (body.waypoints.length > 10) {
      ctx.status = 400;
      ctx.body = { error: "Maximum 10 waypoints" };
      return;
    }

    const traceId = crypto.randomUUID();
    const task = taskStore.create({ waypoints: body.waypoints });

    try {
      const output = await itinerarySupervisor.run({ waypoints: body.waypoints }, task.taskId, traceId);
      taskStore.complete(task.taskId, output);
      ctx.body = { taskId: task.taskId, ...output };
    } catch (error) {
      taskStore.fail(task.taskId);
      ctx.status = 500;
      ctx.body = {
        error: error instanceof Error ? error.message : String(error),
        taskId: task.taskId,
      };
    }
  });

  router.get("/agents", (ctx) => {
    ctx.body = agentRegistry.getAll();
  });

  router.get("/tasks/:taskId", (ctx) => {
    const task = taskStore.get(ctx.params.taskId);
    if (!task) {
      ctx.status = 404;
      ctx.body = { error: "Task introuvable" };
      return;
    }
    ctx.body = task;
  });

  router.get("/tasks/:taskId/events", (ctx) => {
    const task = taskStore.get(ctx.params.taskId);
    if (!task) {
      ctx.status = 404;
      ctx.body = { error: "Task introuvable" };
      return;
    }
    ctx.body = task.events;
  });

  return router;
}
