"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Thermometer,
  Droplets,
  Wind,
  CloudRain,
  AlertTriangle,
  Lightbulb,
  FileText,
} from "lucide-react";

interface WeatherData {
  temperature: number;
  rainProbability: number;
  wind: number;
  humidity: number;
}

interface WeatherReportProps {
  location: { name: string; latitude: number; longitude: number; country?: string };
  weatherData: WeatherData;
  report: string;
  risks: string[];
  traceId: string;
}

const RISK_CONFIG: Record<string, { label: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
  rain:  { label: "Pluie",     variant: "default" },
  wind:  { label: "Vent fort", variant: "secondary" },
  heat:  { label: "Chaleur",   variant: "destructive" },
  cold:  { label: "Froid",     variant: "outline" },
  frost: { label: "Gel",       variant: "outline" },
};

const KNOWN_SECTIONS = ["résumé", "conditions actuelles", "risques", "conseils"];

function parseReport(raw: string) {
  const sections: { title: string; content: string }[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of raw.split("\n")) {
    const mdHeading = line.match(/^#{2,3}\s+(.+)/);
    const boldHeading = line.match(/^\*\*([^*]+?)\s*:?\s*\*\*/);
    const rawTitle = mdHeading?.[1] ?? boldHeading?.[1];

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
  return sections.filter((s) => !s.title.toLowerCase().includes("conditions actuelles"));
}

function PlainText({ content }: { content: string }) {
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      {content.split("\n").map((line, i) => {
        const clean = line.replace(/\*\*(.+?)\*\*/g, "$1").trim();
        if (!clean) return null;
        if (clean.startsWith("- ")) {
          return <p key={i} className="pl-3 border-l-2 border-muted">{clean.slice(2)}</p>;
        }
        return <p key={i}>{clean}</p>;
      })}
    </div>
  );
}

const SECTION_CONFIG: Record<string, { icon: React.ReactNode; accent: string; titleColor: string }> = {
  risques: {
    icon: <AlertTriangle className="h-4 w-4" />,
    accent: "border-l-4 border-l-orange-400",
    titleColor: "text-orange-600 dark:text-orange-400",
  },
  conseils: {
    icon: <Lightbulb className="h-4 w-4" />,
    accent: "border-l-4 border-l-green-400",
    titleColor: "text-green-600 dark:text-green-400",
  },
};

function getSectionConfig(title: string) {
  for (const [key, cfg] of Object.entries(SECTION_CONFIG)) {
    if (title.toLowerCase().includes(key)) return cfg;
  }
  return { icon: <FileText className="h-4 w-4" />, accent: "", titleColor: "text-muted-foreground" };
}

const METRICS = [
  { key: "temperature",    label: "Température",          icon: <Thermometer className="h-5 w-5 text-orange-500" />, format: (v: number) => `${v}°C` },
  { key: "rainProbability", label: "Probabilité de pluie", icon: <CloudRain   className="h-5 w-5 text-blue-500" />,   format: (v: number) => `${v}%` },
  { key: "wind",           label: "Vent",                  icon: <Wind        className="h-5 w-5 text-sky-500" />,    format: (v: number) => `${v} km/h` },
  { key: "humidity",       label: "Humidité",              icon: <Droplets    className="h-5 w-5 text-cyan-500" />,   format: (v: number) => `${v}%` },
] as const;

export function WeatherReport({ location, weatherData, report, risks, traceId }: WeatherReportProps) {
  const allSections = parseReport(report);
  const resume = allSections.find((s) => s.title.toLowerCase().includes("résumé"));
  const others = allSections.filter((s) => !s.title.toLowerCase().includes("résumé"));

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{location.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            {location.country && ` · ${location.country}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {risks.length === 0 ? (
            <Badge variant="outline">Aucun risque</Badge>
          ) : (
            risks.map((r) => (
              <Badge key={r} variant={RISK_CONFIG[r]?.variant ?? "default"}>
                {RISK_CONFIG[r]?.label ?? r}
              </Badge>
            ))
          )}
        </div>
      </div>

      {/* Résumé — pleine largeur */}
      {resume && (
        <Card className="bg-muted/30">
          <CardContent className="px-5 py-4">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              <FileText className="h-4 w-4" />
              {resume.title}
            </div>
            <p className="text-base leading-relaxed">
              {resume.content.replace(/\*\*(.+?)\*\*/g, "$1").trim()}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Conditions — données structurées, jamais dépendantes d'Ollama */}
      <Card className="border-l-4 border-l-blue-400 overflow-hidden">
        <CardContent className="px-4 py-4">
          <div className="flex items-center gap-1.5 mb-3 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            <Thermometer className="h-4 w-4" />
            Conditions actuelles
          </div>
          <div className="grid grid-cols-2 gap-3">
            {METRICS.map(({ key, label, icon, format }) => (
              <div key={key} className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
                <span className="shrink-0">{icon}</span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                  <p className="text-sm font-semibold leading-tight">{format(weatherData[key])}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Risques + Conseils */}
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
