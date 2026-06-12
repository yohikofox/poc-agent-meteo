import { connect, StringCodec } from "nats";
import { AgentResponse } from "../shared/types";

const SUBJECT = "agents.report.check";
const sc = StringCodec();

interface QualityResult {
  passed: boolean;
  score: number;
  details: string[];
}

function check(report: string): QualityResult {
  const lower = report.toLowerCase();
  const required = ["résumé", "conditions actuelles", "risques", "conseils"];
  const details: string[] = [];
  let score = 0;

  for (const section of required) {
    if (lower.includes(section)) {
      score++;
      details.push(`✓ "${section}"`);
    } else {
      details.push(`✗ "${section}" absente`);
    }
  }

  return { passed: score >= 3, score, details };
}

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  console.log(`[quality-check-agent] connecté — en écoute sur ${SUBJECT}`);

  const sub = nc.subscribe(SUBJECT);
  for await (const msg of sub) {
    let result: AgentResponse<QualityResult>;
    try {
      const report = JSON.parse(sc.decode(msg.data)) as string;
      const qr = check(report);
      result = {
        status: qr.passed ? "success" : "failed",
        output: qr,
        reason: qr.passed ? undefined : `Qualité insuffisante (${qr.score}/4 sections)`,
      };
    } catch (err) {
      result = { status: "failed", reason: err instanceof Error ? err.message : String(err) };
    }
    msg.respond(sc.encode(JSON.stringify(result)));
  }
}

main().catch((err) => { console.error("[quality-check-agent]", err); process.exit(1); });
