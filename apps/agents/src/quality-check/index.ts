import "../tracing";
import { connect, StringCodec } from "nats";
import type { MsgHdrs } from "nats";
import { context, propagation, trace, SpanStatusCode } from "@opentelemetry/api";
import { AgentResponse } from "../shared/types";
import { logger, traceCtx } from "../shared/logger";

const SUBJECT = "agents.report.check";
const sc = StringCodec();
const tracer = trace.getTracer("quality-check-agent");

const natsGetter = {
  get: (carrier: MsgHdrs, key: string) => carrier.get(key) || undefined,
  keys: (carrier: MsgHdrs) => [...carrier.keys()],
};

interface QualityResult { passed: boolean; score: number; details: string[] }

function check(report: string): QualityResult {
  const lower = report.toLowerCase();
  const required = ["résumé", "conditions actuelles", "risques", "conseils"];
  const details: string[] = [];
  let score = 0;
  for (const s of required) {
    if (lower.includes(s)) { score++; details.push(`✓ "${s}"`); }
    else details.push(`✗ "${s}" absente`);
  }
  return { passed: score >= 3, score, details };
}

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  logger.info({ subject: SUBJECT }, "Agent démarré");

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    const parentCtx = msg.headers
      ? propagation.extract(context.active(), msg.headers as MsgHdrs, natsGetter)
      : context.active();

    await tracer.startActiveSpan("report.quality-check", {}, parentCtx, async (span) => {
      let result: AgentResponse<QualityResult>;
      try {
        const report = JSON.parse(sc.decode(msg.data)) as string;
        const qr = check(report);
        span.setAttributes({ "quality.score": qr.score, "quality.passed": qr.passed });
        result = {
          status: qr.passed ? "success" : "failed",
          output: qr,
          reason: qr.passed ? undefined : `Qualité insuffisante (${qr.score}/4 sections)`,
        };
        if (!qr.passed) span.setStatus({ code: SpanStatusCode.ERROR, message: result.reason });
        logger.info({ ...traceCtx(), score: qr.score, passed: qr.passed }, "Contrôle qualité terminé");
      } catch (err) {
        result = { status: "failed", reason: err instanceof Error ? err.message : String(err) };
        span.recordException(err instanceof Error ? err : new Error(result.reason!));
        span.setStatus({ code: SpanStatusCode.ERROR });
        logger.error({ ...traceCtx(), err: result.reason }, "Erreur");
      }
      span.end();
      msg.respond(sc.encode(JSON.stringify(result)));
    });
  }
}

main().catch((err) => { logger.error({ err }, "Erreur fatale"); process.exit(1); });
