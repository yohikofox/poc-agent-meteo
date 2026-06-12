import { ItineraryForm } from "@/components/ItineraryForm";

export default function ItineraryPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl py-12 px-4">
        <div className="mb-10 space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Itinéraire météo</h1>
          <p className="text-muted-foreground">
            Bulletin de voyage généré par un Supervisor agentique · Traitement parallèle · Dégradation gracieuse
          </p>
        </div>
        <ItineraryForm />
      </div>
    </main>
  );
}
