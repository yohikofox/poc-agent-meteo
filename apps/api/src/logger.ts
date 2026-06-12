import pino from "pino";
import { trace } from "@opentelemetry/api";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.OTEL_SERVICE_NAME ?? "api" },
});

// Injecte traceId + spanId dans les logs pour lier logs ↔ traces dans Grafana
export function traceCtx(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const { traceId, spanId } = span.spanContext();
  return { traceId, spanId };
}
