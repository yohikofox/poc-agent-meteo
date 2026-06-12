export async function POST(request: Request) {
  const body = await request.json();
  try {
    const res = await fetch(`${process.env.API_URL}/weather-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: "API Koa inaccessible — vérifiez que npm run dev tourne dans le dossier racine (port 3000)" },
      { status: 503 }
    );
  }
}
