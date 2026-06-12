"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WeatherReport } from "@/components/WeatherReport";
import { ItineraryReport } from "@/components/ItineraryReport";
import { AgentTrace } from "@/components/AgentTrace";
import { Sparkles, ArrowRight, CheckCircle, AlertCircle, Cpu } from "lucide-react";

interface PlannerIntent {
  type: string;
  label: string;
  description: string;
  inputSchema: string;
  example: string;
}

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

interface IntentResult {
  intent: WeatherIntent;
  status: "success" | "failed";
  output?: WeatherReportOutput | ItineraryOutput;
  reason?: string;
}

interface AskResult {
  taskId: string;
  question: string;
  availableIntents: PlannerIntent[];
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
  "Météo à Toulouse",
  "Il pleut à Paris ? Et à Lyon ?",
  "Conditions pour un trajet Brest → Strasbourg",
  "Météo à Bordeaux et trajet Nice → Grenoble",
];

function IntentTypeChip({ type, active }: { type: string; active?: boolean }) {
  return (
    <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${
      active
        ? "bg-sky-100 border-sky-400 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
        : "bg-muted border-border text-muted-foreground"
    }`}>
      {type}
    </span>
  );
}

function AvailableIntentCard({ intent, usedBy }: { intent: PlannerIntent; usedBy: WeatherIntent[] }) {
  const matchingUses = usedBy.filter((i) => i.type === intent.type);
  const isUsed = matchingUses.length > 0;

  return (
    <Card className={`transition-colors ${isUsed ? "border-sky-400/60 bg-sky-400/5" : ""}`}>
      <CardContent className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <IntentTypeChip type={intent.type} active={isUsed} />
          {isUsed && <CheckCircle className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
        </div>
        <p className="text-xs font-medium">{intent.label}</p>
        <p className="text-xs text-muted-foreground leading-snug">{intent.description}</p>
        <p className="text-[10px] font-mono text-muted-foreground/70 bg-muted rounded px-1.5 py-0.5">
          {intent.inputSchema}
        </p>
        {isUsed && (
          <div className="space-y-1 pt-1 border-t border-border">
            {matchingUses.map((u, i) => (
              <p key={i} className="text-[11px] text-sky-600 dark:text-sky-400 font-medium">
                {u.type === "weather-report"
                  ? `→ ${(u as { type: "weather-report"; location: string }).location}`
                  : `→ ${(u as { type: "itinerary"; from: string; to: string }).from} → ${(u as { type: "itinerary"; from: string; to: string }).to}`}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
    return <WeatherReport location={o.location} weatherData={o.weatherData} report={o.report} risks={o.risks} traceId={o.traceId} />;
  }

  if (result.intent.type === "itinerary" && result.status === "success") {
    const o = result.output as ItineraryOutput;
    return <ItineraryReport from={o.from} to={o.to} waypoints={o.waypoints} report={o.report} degraded={o.degraded} qualityPassed={o.qualityPassed} traceId={o.traceId} />;
  }

  return null;
}

export function PlannerInspector() {
  const [availableIntents, setAvailableIntents] = useState<PlannerIntent[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);

  useEffect(() => {
    fetch("/api/planner/intents")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setAvailableIntents(d))
      .catch(() => {});
  }, []);

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
        setError(data.error ?? "Erreur lors de l'analyse");
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

  const chosenIntents = result?.plan.intents ?? [];

  return (
    <div className="space-y-8">
      {/* Colonnes : intents disponibles | formulaire */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">

        {/* Panneau gauche : intents injectés */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Intents injectés ({availableIntents.length})
            </span>
          </div>
          {availableIntents.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chargement…</p>
          ) : (
            availableIntents.map((intent) => (
              <AvailableIntentCard key={intent.type} intent={intent} usedBy={chosenIntents} />
            ))
          )}
          {availableIntents.length > 0 && (
            <p className="text-[10px] text-muted-foreground leading-relaxed pt-1">
              Ces descriptions sont injectées dans le prompt LLM à chaque requête depuis{" "}
              <span className="font-mono">planner-intents.json</span>.
            </p>
          )}
        </div>

        {/* Panneau droit : formulaire + plan */}
        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              placeholder="Ex : Météo à Bordeaux et conditions pour un trajet Paris → Lyon"
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
                  Planification…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Planifier &amp; exécuter
                </>
              )}
            </Button>
          </form>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Plan généré */}
          {result && (
            <Card className="border-sky-400/30 bg-sky-400/5">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400 flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" />
                  Plan généré par le LLM
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <p className="text-sm">{result.plan.explanation}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {result.plan.intents.map((intent, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs bg-background border border-sky-400/40 rounded-full px-2.5 py-1">
                      <IntentTypeChip type={intent.type} active />
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">
                        {intent.type === "weather-report"
                          ? intent.location
                          : `${intent.from} → ${intent.to}`}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <Badge variant="outline" className="text-[10px]">
                    stratégie : parallel allSettled
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {result.results.filter((r) => r.status === "success").length}/{result.results.length} succès
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Résultats */}
      {result && result.results.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Résultats d&apos;exécution
          </h2>
          {result.results.map((r, i) => (
            <IntentResultCard key={i} result={r} />
          ))}
        </div>
      )}

      {/* Trace */}
      {events.length > 0 && <AgentTrace events={events} />}
    </div>
  );
}
