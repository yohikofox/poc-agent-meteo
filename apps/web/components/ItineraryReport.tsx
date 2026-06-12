"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  AlertTriangle,
  Lightbulb,
  FileText,
  Thermometer,
  CloudRain,
  Wind,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface WaypointResult {
  name: string;
  status: "success" | "degraded";
  location?: { name: string; latitude: number; longitude: number; country?: string };
  weatherData?: { temperature: number; rainProbability: number; wind: number; humidity: number };
  risks?: string[];
  reason?: string;
}

interface ItineraryReportProps {
  waypoints: WaypointResult[];
  report: string;
  degraded: string[];
  qualityPassed: boolean;
  traceId: string;
}

const KNOWN_SECTIONS = ["résumé du trajet", "étapes", "points d'attention", "conseils"];

const SECTION_CONFIG: Record<string, { icon: React.ReactNode; accent: string; titleColor: string }> = {
  "résumé du trajet":   { icon: <FileText      className="h-4 w-4" />, accent: "",                           titleColor: "text-muted-foreground" },
  "étapes":             { icon: <MapPin         className="h-4 w-4" />, accent: "border-l-4 border-l-blue-400",   titleColor: "text-blue-600 dark:text-blue-400" },
  "points d'attention": { icon: <AlertTriangle  className="h-4 w-4" />, accent: "border-l-4 border-l-orange-400", titleColor: "text-orange-600 dark:text-orange-400" },
  "conseils":           { icon: <Lightbulb      className="h-4 w-4" />, accent: "border-l-4 border-l-green-400",  titleColor: "text-green-600 dark:text-green-400" },
};

function getSectionConfig(title: string) {
  const key = Object.keys(SECTION_CONFIG).find((k) => title.toLowerCase().includes(k));
  return key ? SECTION_CONFIG[key] : { icon: <FileText className="h-4 w-4" />, accent: "", titleColor: "text-muted-foreground" };
}

function parseReport(raw: string) {
  const sections: { title: string; content: string }[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of raw.split("\n")) {
    const match = line.match(/^#{2,3}\s+(.+)/) ?? line.match(/^\*\*([^*]+?)\s*:?\s*\*\*/);
    const rawTitle = match?.[1];
    if (rawTitle) {
      const clean = rawTitle.replace(/\*+/g, "").replace(/\s*:?\s*$/, "").trim();
      if (KNOWN_SECTIONS.some((s) => clean.toLowerCase().includes(s))) {
        if (current) sections.push({ title: current.title, content: current.lines.join("\n").trim() });
        current = { title: clean, lines: [] };
        continue;
      }
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push({ title: current.title, content: current.lines.join("\n").trim() });
  return sections;
}

function PlainText({ content }: { content: string }) {
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      {content.split("\n").map((line, i) => {
        const clean = line.replace(/\*\*(.+?)\*\*/g, "$1").trim();
        if (!clean) return null;
        if (clean.startsWith("- ")) return <p key={i} className="pl-3 border-l-2 border-muted">{clean.slice(2)}</p>;
        return <p key={i}>{clean}</p>;
      })}
    </div>
  );
}

function WaypointStrip({ waypoints }: { waypoints: WaypointResult[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {waypoints.map((wp, i) => (
        <div key={i} className="flex flex-col items-center gap-1 min-w-[90px]">
          {i > 0 && (
            <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 w-2 h-px bg-border" />
          )}
          <div
            className={`w-full rounded-lg px-2 py-2 text-center border ${
              wp.status === "degraded"
                ? "bg-destructive/5 border-destructive/30"
                : "bg-muted/50 border-border"
            }`}
          >
            <p className="text-xs font-medium truncate max-w-[80px]" title={wp.name}>{wp.name}</p>
            {wp.status === "success" && wp.weatherData ? (
              <div className="flex items-center justify-center gap-1 mt-1">
                <Thermometer className="h-3 w-3 text-orange-500" />
                <span className="text-xs font-semibold">{wp.weatherData.temperature}°C</span>
              </div>
            ) : (
              <p className="text-xs text-destructive mt-1">N/A</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {wp.status === "success" && wp.weatherData && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <CloudRain className="h-3 w-3" />{wp.weatherData.rainProbability}%
              </span>
            )}
            {wp.status === "success" && wp.weatherData && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Wind className="h-3 w-3" />{wp.weatherData.wind}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ItineraryReport({ waypoints, report, degraded, qualityPassed, traceId }: ItineraryReportProps) {
  const sections = parseReport(report);
  const resume = sections.find((s) => s.title.toLowerCase().includes("résumé"));
  const others = sections.filter((s) => !s.title.toLowerCase().includes("résumé"));
  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            {origin?.name}
            <span className="text-muted-foreground font-normal">→</span>
            {destination?.name}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{waypoints.length} étapes</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {degraded.length > 0 && (
            <Badge variant="destructive">{degraded.length} étape{degraded.length > 1 ? "s" : ""} dégradée{degraded.length > 1 ? "s" : ""}</Badge>
          )}
          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${qualityPassed ? "border-green-400/40 text-green-600 dark:text-green-400 bg-green-400/5" : "border-orange-400/40 text-orange-600 dark:text-orange-400 bg-orange-400/5"}`}>
            {qualityPassed
              ? <><CheckCircle className="h-3 w-3" /> Qualité validée</>
              : <><XCircle className="h-3 w-3" /> Qualité non validée</>
            }
          </span>
        </div>
      </div>

      {/* Strip des waypoints */}
      <Card>
        <CardContent className="px-4 py-3">
          <WaypointStrip waypoints={waypoints} />
        </CardContent>
      </Card>

      {/* Résumé */}
      {resume && (
        <Card className="bg-muted/30">
          <CardContent className="px-5 py-4">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              <FileText className="h-4 w-4" />
              {resume.title}
            </div>
            <p className="text-base leading-relaxed">{resume.content.replace(/\*\*(.+?)\*\*/g, "$1").trim()}</p>
          </CardContent>
        </Card>
      )}

      {/* Autres sections */}
      {others.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {others.map((section) => {
            const cfg = getSectionConfig(section.title);
            return (
              <Card key={section.title} className={`overflow-hidden ${cfg.accent}`}>
                <CardContent className="px-4 py-4">
                  <div className={`flex items-center gap-1.5 mb-3 text-xs font-semibold uppercase tracking-wide ${cfg.titleColor}`}>
                    {cfg.icon}
                    {section.title}
                  </div>
                  <PlainText content={section.content} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-right">trace : {traceId}</p>
    </div>
  );
}
