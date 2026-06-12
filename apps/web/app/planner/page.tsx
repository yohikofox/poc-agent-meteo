import { PlannerInspector } from "@/components/PlannerInspector";

export const metadata = { title: "Planner / Executor — Inspection" };

export default function PlannerPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-3xl font-bold tracking-tight">Planner / Executor</h1>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
            inspection
          </span>
        </div>
        <p className="mt-2 text-muted-foreground text-sm max-w-2xl">
          Le planificateur LLM reçoit dynamiquement la liste des intents disponibles depuis le registre.
          Il décide lesquels invoquer en réponse à une question libre — sans logique codée en dur.
        </p>
      </div>
      <PlannerInspector />
    </main>
  );
}
