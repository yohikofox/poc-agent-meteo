interface OllamaResponse {
  response: string;
}

export class OllamaClient {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
    this.model = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
  }

  async generate(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: { num_predict: 1000 },
      }),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = (await response.json()) as OllamaResponse;
    return data.response;
  }
}
