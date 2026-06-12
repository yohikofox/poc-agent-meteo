import { Task, TaskEvent } from "../types/task";

export class TaskStore {
  private tasks = new Map<string, Task>();

  create(input: unknown): Task {
    const task: Task = {
      taskId: crypto.randomUUID(),
      status: "running",
      input,
      events: [],
    };
    this.tasks.set(task.taskId, task);
    return task;
  }

  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  addEvent(taskId: string, event: TaskEvent): void {
    const task = this.tasks.get(taskId);
    if (task) task.events.push(event);
  }

  complete(taskId: string, output: unknown): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "completed";
      task.output = output;
    }
  }

  fail(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) task.status = "failed";
  }
}
