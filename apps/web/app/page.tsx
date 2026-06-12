import { WeatherForm } from "@/components/WeatherForm";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl py-12 px-4">
        <div className="mb-10 space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Agent Météo</h1>
          <p className="text-muted-foreground">
            Rapport météo généré par une plateforme agentique locale · Ollama · Open-Meteo
          </p>
        </div>
        <WeatherForm />
      </div>
    </main>
  );
}
