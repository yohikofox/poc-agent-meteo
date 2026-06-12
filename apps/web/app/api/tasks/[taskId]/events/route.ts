export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const res = await fetch(`${process.env.API_URL}/tasks/${taskId}/events`);
  const data = await res.json();
  return Response.json(data);
}
