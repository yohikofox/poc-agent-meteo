"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EventType = "started" | "completed" | "failed" | "decision" | "retry" | "degraded";
type EventSource = "agent" | "orchestrator" | "supervisor" | "planner";

interface TaskEvent {
  timestamp: string;
  agentId: string;
  source?: EventSource;
  type: EventType;
  message: string;
  output?: unknown;
}

interface AgentTraceProps {
  events: TaskEvent[];
}

const TYPE_STYLES: Record<EventType, { dot: string; label: string; bg?: string }> = {
  started:   { dot: "bg-blue-400",   label: "text-blue-600   dark:text-blue-400" },
  completed: { dot: "bg-green-400",  label: "text-green-600  dark:text-green-400" },
  failed:    { dot: "bg-red-400",    label: "text-red-600    dark:text-red-400" },
  decision:  { dot: "bg-purple-500", label: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/5 border border-purple-500/20 rounded-lg px-3 py-2" },
  retry:     { dot: "bg-orange-400", label: "text-orange-600 dark:text-orange-400", bg: "bg-orange-400/5 border border-orange-400/20 rounded-lg px-3 py-2" },
  degraded:  { dot: "bg-amber-400",  label: "text-amber-600  dark:text-amber-400",  bg: "bg-amber-400/5  border border-amber-400/20  rounded-lg px-3 py-2" },
};

const SOURCE_BADGE: Record<EventSource, { label: string; cls: string }> = {
  orchestrator: { label: "orchestrateur", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  supervisor:   { label: "superviseur",   cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  planner:      { label: "planificateur", cls: "bg-sky-100    text-sky-700    dark:bg-sky-900/40    dark:text-sky-300" },
  agent:        { label: "agent",         cls: "bg-muted      text-muted-foreground" },
};

function formatOutput(output: unknown): string {
  if (typeof output === "string") {
    return output.length > 1200 ? output.slice(0, 1200) + "\n…(tronqué)" : output;
  }
  return JSON.stringify(output, null, 2);
}

function AgentEventRow({ event }: { event: TaskEvent }) {
  const [open, setOpen] = useState(false);
  const style = TYPE_STYLES[event.type] ?? TYPE_STYLES.started;
  const isDecisionLike = event.type === "decision" || event.type === "retry" || event.type === "degraded";
  const hasOutput = (isDecisionLike || event.type === "completed") && event.output !== undefined;
  const source = event.source ?? "agent";
  const badge = SOURCE_BADGE[source];

  return (
    <li className="space-y-1">
      <div
        className={`flex items-start gap-3 text-sm ${style.bg ?? ""} ${hasOutput ? "cursor-pointer select-none" : ""}`}
        onClick={() => hasOutput && setOpen((v) => !v)}
      >
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono text-xs font-semibold ${style.label}`}>
              {event.type.toUpperCase()}
            </span>
            {source !== "agent" && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
                {badge.label}
              </span>
            )}
            <span className="text-muted-foreground text-xs">{event.agentId}</span>
            {hasOutput && (
              <span className="text-xs text-muted-foreground/60">
                {open ? "▲ masquer" : "▼ détails"}
              </span>
            )}
          </div>
          {isDecisionLike && (
            <p className="text-xs text-foreground/80 leading-snug">{event.message}</p>
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
  const decisions = events.filter((e) => e.type === "decision" || e.type === "retry" || e.type === "degraded");

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Trace des agents
          </CardTitle>
          {decisions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {decisions.length} décision{decisions.length > 1 ? "s" : ""} d&apos;orchestration
            </span>
          )}
        </div>
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
