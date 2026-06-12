export interface TaskEvent {
  timestamp: string;
  agentId: string;
  type: "started" | "completed" | "failed";
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
