export async function POST(request: Request) {
  const body = await request.json();
  try {
    const res = await fetch(`${process.env.API_URL}/weather-ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: "API inaccessible — vérifiez que le service API tourne (port 3000)" },
      { status: 503 }
    );
  }
}
