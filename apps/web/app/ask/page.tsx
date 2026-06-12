import { AskForm } from "@/components/AskForm";

export const metadata = { title: "Question libre — Météo IA" };

export default function AskPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Question libre</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Posez une question en langage naturel. Un agent planificateur LLM détermine automatiquement
          quels services météo invoquer, dans quel ordre, pour y répondre.
        </p>
      </div>
      <AskForm />
    </main>
  );
}
