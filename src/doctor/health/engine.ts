import type { HealthContext, HealthReport } from "./types.js";
import { allHealthChecks } from "./checks/index.js";

/** Run all health checks and produce a report with findings. */
export function runHealthCheck(ctx: HealthContext): HealthReport {
  const findings = allHealthChecks.flatMap((check) => check.run(ctx));

  const byCheck: Record<string, number> = {};
  let recommendations = 0;
  let observations = 0;

  for (const f of findings) {
    byCheck[f.checkId] = (byCheck[f.checkId] ?? 0) + 1;
    if (f.severity === "recommendation") recommendations++;
    else observations++;
  }

  return {
    checkedAt: new Date().toISOString(),
    totalFindings: findings.length,
    findings,
    summary: { recommendations, observations, byCheck },
  };
}
