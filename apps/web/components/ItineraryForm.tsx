"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItineraryReport } from "@/components/ItineraryReport";
import { AgentTrace } from "@/components/AgentTrace";
import { Plus, X } from "lucide-react";

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
  waypoints: WaypointResult[];
  report: string;
  degraded: string[];
  qualityPassed: boolean;
  traceId: string;
}

interface TaskEvent {
  timestamp: string;
  agentId: string;
  type: "started" | "completed" | "failed";
  message: string;
  output?: unknown;
}

export function ItineraryForm() {
  const [waypoints, setWaypoints] = useState<string[]>(["", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ItineraryResult | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);

  const updateWaypoint = (i: number, value: string) => {
    setWaypoints((prev) => prev.map((w, idx) => (idx === i ? value : w)));
  };

  const addWaypoint = () => {
    if (waypoints.length < 10) setWaypoints((prev) => [...prev, ""]);
  };

  const removeWaypoint = (i: number) => {
    if (waypoints.length > 2) setWaypoints((prev) => prev.filter((_, idx) => idx !== i));
  };

  const filled = waypoints.filter((w) => w.trim().length > 0);
  const canSubmit = filled.length >= 2 && !loading;

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
        body: JSON.stringify({ waypoints: filled }),
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
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          {waypoints.map((wp, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs font-mono text-muted-foreground">{i + 1}</span>
              <Input
                placeholder={i === 0 ? "Ville de départ (ex : Brest)" : i === waypoints.length - 1 ? "Ville d'arrivée (ex : Nice)" : `Étape ${i + 1}`}
                value={wp}
                onChange={(e) => updateWaypoint(i, e.target.value)}
                disabled={loading}
                className="max-w-xs"
              />
              {waypoints.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeWaypoint(i)}
                  disabled={loading}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pl-7">
          {waypoints.length < 10 && (
            <button
              type="button"
              onClick={addWaypoint}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />
              Ajouter une étape
            </button>
          )}
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
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-4">
          <ItineraryReport
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
