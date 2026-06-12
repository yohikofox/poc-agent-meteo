"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherReport } from "@/components/WeatherReport";
import { ItineraryReport } from "@/components/ItineraryReport";
import { AgentTrace } from "@/components/AgentTrace";
import { Sparkles, AlertCircle } from "lucide-react";

type WeatherIntent =
  | { type: "weather-report"; location: string }
  | { type: "itinerary"; from: string; to: string };

interface WeatherReportOutput {
  location: { name: string; latitude: number; longitude: number; country?: string };
  weatherData: { temperature: number; rainProbability: number; wind: number; humidity: number };
  report: string;
  risks: string[];
  traceId: string;
}

interface WaypointResult {
  name: string;
  status: "success" | "degraded";
  location?: { name: string; latitude: number; longitude: number; country?: string };
  weatherData?: { temperature: number; rainProbability: number; wind: number; humidity: number };
  risks?: string[];
  reason?: string;
}

interface ItineraryOutput {
  from: string;
  to: string;
  waypoints: WaypointResult[];
  report: string;
  degraded: string[];
  qualityPassed: boolean;
  traceId: string;
}

type IntentResult =
  | { intent: { type: "weather-report"; location: string }; status: "success"; output: WeatherReportOutput }
  | { intent: { type: "weather-report"; location: string }; status: "failed"; reason: string }
  | { intent: { type: "itinerary"; from: string; to: string }; status: "success"; output: ItineraryOutput }
  | { intent: { type: "itinerary"; from: string; to: string }; status: "failed"; reason: string };

interface AskResult {
  taskId: string;
  question: string;
  plan: { explanation: string; intents: WeatherIntent[] };
  results: IntentResult[];
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

const EXAMPLES = [
  "Quel temps fait-il à Bordeaux ?",
  "Météo à Paris et Lyon ce weekend",
  "Je veux faire un trajet de Brest à Strasbourg, conditions météo ?",
  "Est-ce qu'il y a des risques météo pour un trajet Toulouse → Grenoble ?",
];

function IntentBadge({ intent }: { intent: WeatherIntent }) {
  if (intent.type === "weather-report") {
    return <Badge variant="outline" className="text-xs">{intent.location}</Badge>;
  }
  return (
    <Badge variant="outline" className="text-xs">
      {intent.from} → {intent.to}
    </Badge>
  );
}

function IntentResultCard({ result }: { result: IntentResult }) {
  if (result.status === "failed") {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="px-4 py-4">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              {result.intent.type === "weather-report"
                ? `${result.intent.location} — `
                : `${result.intent.from} → ${result.intent.to} — `}
              {result.reason}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (result.intent.type === "weather-report" && result.status === "success") {
    const o = result.output as WeatherReportOutput;
    return (
      <WeatherReport
        location={o.location}
        weatherData={o.weatherData}
        report={o.report}
        risks={o.risks}
        traceId={o.traceId}
      />
    );
  }

  if (result.intent.type === "itinerary" && result.status === "success") {
    const o = result.output as ItineraryOutput;
    return (
      <ItineraryReport
        from={o.from}
        to={o.to}
        waypoints={o.waypoints}
        report={o.report}
        degraded={o.degraded}
        qualityPassed={o.qualityPassed}
        traceId={o.traceId}
      />
    );
  }

  return null;
}

export function AskForm() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);

  const canSubmit = question.trim().length > 0 && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setEvents([]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'analyse de la question");
        return;
      }

      setResult(data as AskResult);

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
        <textarea
          placeholder="Ex : Quel temps fait-il à Paris et y a-t-il des risques pour un trajet Lyon-Nice ?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground shrink-0">Exemples :</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuestion(ex)}
              disabled={loading}
              className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 hover:bg-muted transition-colors disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>

        <Button type="submit" disabled={!canSubmit} className="gap-2">
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Analyse en cours…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Analyser
            </>
          )}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-6">
          {/* Explication du plan */}
          <Card className="border-sky-400/30 bg-sky-400/5">
            <CardContent className="px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 shrink-0 mt-0.5">
                  planificateur
                </span>
                <div className="space-y-2">
                  <p className="text-sm">{result.plan.explanation}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {result.plan.intents.map((intent, i) => (
                      <IntentBadge key={i} intent={intent} />
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Résultats par intention */}
          <div className="space-y-6">
            {result.results.map((r, i) => (
              <IntentResultCard key={i} result={r} />
            ))}
          </div>

          {events.length > 0 && <AgentTrace events={events} />}
        </div>
      )}
    </div>
  );
}
