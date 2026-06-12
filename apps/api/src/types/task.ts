export type EventType = "started" | "completed" | "failed" | "decision" | "retry" | "degraded";
export type EventSource = "agent" | "orchestrator" | "supervisor" | "planner";

export interface TaskEvent {
  timestamp: string;
  agentId: string;
  source: EventSource;
  type: EventType;
  message: string;
  output?: unknown;
}

export interface Task {
  taskId: string;
  status: "running" | "completed" | "failed";
  input: unknown;
  output?: unknown;
  events: TaskEvent[];
}
