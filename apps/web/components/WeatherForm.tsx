"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WeatherReport } from "@/components/WeatherReport";
import { AgentTrace } from "@/components/AgentTrace";

interface WeatherResult {
  taskId: string;
  location: { name: string; latitude: number; longitude: number; country?: string };
  weatherData: { temperature: number; rainProbability: number; wind: number; humidity: number };
  report: string;
  risks: string[];
  traceId: string;
}

interface TaskEvent {
  timestamp: string;
  agentId: string;
  type: "started" | "completed" | "failed";
  message: string;
}

export function WeatherForm() {
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WeatherResult | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setEvents([]);

    try {
      const res = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: location.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la génération du rapport");
        return;
      }

      setResult(data as WeatherResult);

      const eventsRes = await fetch(`/api/tasks/${data.taskId}/events`);
      if (eventsRes.ok) setEvents(await eventsRes.json());
    } catch {
      setError("Impossible de contacter le serveur. Vérifiez que l'API est démarrée.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <Input
          placeholder="Ville (ex : Nantes, Paris, Lyon…)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          disabled={loading}
          className="max-w-sm"
        />
        <Button type="submit" disabled={loading || !location.trim()}>
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Génération…
            </span>
          ) : (
            "Générer le rapport"
          )}
        </Button>
      </form>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {result && (
        <div className="space-y-4">
          <WeatherReport
            location={result.location}
            weatherData={result.weatherData}
            report={result.report}
            risks={result.risks}
            traceId={result.traceId}
          />
          {events.length > 0 && <AgentTrace events={events} />}
        </div>
      )}
    </div>
  );
}
