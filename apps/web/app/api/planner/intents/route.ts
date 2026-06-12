export async function GET() {
  try {
    const res = await fetch(`${process.env.API_URL}/planner/intents`);
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: "API inaccessible" },
      { status: 503 }
    );
  }
}
