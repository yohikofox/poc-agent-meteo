"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TaskEvent {
  timestamp: string;
  agentId: string;
  type: "started" | "completed" | "failed";
  message: string;
  output?: unknown;
}

interface AgentTraceProps {
  events: TaskEvent[];
}

const TYPE_STYLES = {
  started:   { dot: "bg-blue-400",  label: "text-blue-600  dark:text-blue-400" },
  completed: { dot: "bg-green-400", label: "text-green-600 dark:text-green-400" },
  failed:    { dot: "bg-red-400",   label: "text-red-600   dark:text-red-400" },
};

function formatOutput(output: unknown): string {
  if (typeof output === "string") {
    return output.length > 1200 ? output.slice(0, 1200) + "\n…(tronqué)" : output;
  }
  return JSON.stringify(output, null, 2);
}

function AgentEventRow({ event }: { event: TaskEvent }) {
  const [open, setOpen] = useState(false);
  const style = TYPE_STYLES[event.type];
  const hasOutput = event.type === "completed" && event.output !== undefined;

  return (
    <li className="space-y-1">
      <div
        className={`flex items-start gap-3 text-sm ${hasOutput ? "cursor-pointer select-none" : ""}`}
        onClick={() => hasOutput && setOpen((v) => !v)}
      >
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
        <div className="flex-1 min-w-0">
          <span className={`font-mono text-xs font-medium ${style.label}`}>
            {event.type.toUpperCase()}
          </span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-muted-foreground">{event.agentId}</span>
          {hasOutput && (
            <span className="ml-2 text-xs text-muted-foreground/60">
              {open ? "▲ masquer" : "▼ voir résultat"}
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {new Date(event.timestamp).toLocaleTimeString("fr-FR")}
        </span>
      </div>

      {open && hasOutput && (
        <pre className="ml-5 rounded-md bg-muted px-3 py-2 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
          {formatOutput(event.output)}
        </pre>
      )}
    </li>
  );
}

export function AgentTrace({ events }: AgentTraceProps) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Trace des agents
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ol className="space-y-2">
          {events.map((e, i) => (
            <AgentEventRow key={i} event={e} />
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
