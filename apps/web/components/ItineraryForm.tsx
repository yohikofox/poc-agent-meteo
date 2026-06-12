"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItineraryReport } from "@/components/ItineraryReport";
import { AgentTrace } from "@/components/AgentTrace";
import { ArrowRight } from "lucide-react";

interface WaypointResult {
  name: string;
  status: "success" | "degraded";
  location?: { name: string; latitude: number; longitude: number; country?: string };
  weatherData?: { temperature: number; rainProbability: number; wind: number; humidity: number };
  risks?: string[];
  reason?: string;
}

interface ItineraryResult {
  taskId: string;
  from: string;
  to: string;
  waypoints: WaypointResult[];
  report: string;
  degraded: string[];
  qualityPassed: boolean;
  traceId: string;
}

interface TaskEvent {
  timestamp: string;
  agentId: string;
  source?: "agent" | "orchestrator" | "supervisor" | "planner";
  type: "started" | "completed" | "failed" | "decision" | "retry" | "degraded";
  message: string;
  output?: unknown;
}

export function ItineraryForm() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ItineraryResult | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);

  const canSubmit = from.trim().length > 0 && to.trim().length > 0 && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setEvents([]);

    try {
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: from.trim(), to: to.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la génération de l'itinéraire");
        return;
      }

      setResult(data as ItineraryResult);

      const eventsRes = await fetch(`/api/tasks/${data.taskId}/events`);
      if (eventsRes.ok) setEvents(await eventsRes.json());
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Ville de départ (ex : Brest)"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={loading}
            className="max-w-xs"
          />
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Ville d'arrivée (ex : Nice)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={loading}
            className="max-w-xs"
          />
          <Button type="submit" disabled={!canSubmit}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Génération…
              </span>
            ) : (
              "Générer l'itinéraire"
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Les étapes intermédiaires sont déterminées automatiquement par un agent LLM.
        </p>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-4">
          <ItineraryReport
            from={result.from}
            to={result.to}
            waypoints={result.waypoints}
            report={result.report}
            degraded={result.degraded}
            qualityPassed={result.qualityPassed}
            traceId={result.traceId}
          />
          {events.length > 0 && <AgentTrace events={events} />}
        </div>
      )}
    </div>
  );
}
