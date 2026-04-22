import type { HealthCheck, HealthContext, HealthFinding } from "../types.js";

const CHECK_ID = "empty-project";
const CHECK_NAME = "Empty Project Detection";

/** Flags new projects with zero artifacts but source files ready for processing. */
export const emptyProjectCheck: HealthCheck = {
  id: CHECK_ID,
  name: CHECK_NAME,
  description: "Detects new projects with no artifacts and suggests onboarding steps",

  run(ctx: HealthContext): HealthFinding[] {
    const counts = ctx.store.counts();
    const totalArtifacts = Object.values(counts).reduce((sum, n) => sum + n, 0);

    if (totalArtifacts > 0) return [];

    const findings: HealthFinding[] = [];

    // Check for unprocessed sources (manifest already scanned by engine)
    if (ctx.manifest) {
      const pending = ctx.manifest.list("pending");
      if (pending.length > 0) {
        findings.push({
          checkId: CHECK_ID,
          checkName: CHECK_NAME,
          severity: "recommendation",
          message: `Project has no artifacts yet, but ${pending.length} source file(s) are ready for processing.`,
          suggestion:
            "Set a persona with set_persona (e.g. 'po'), then ingest the source files to generate initial artifacts.",
        });
        return findings;
      }
    }

    findings.push({
      checkId: CHECK_ID,
      checkName: CHECK_NAME,
      severity: "observation",
      message: "Project is empty — no artifacts or source files found.",
      suggestion:
        "Start by placing source documents in .marvin/sources/ or create your first artifact with set_persona.",
    });

    return findings;
  },
};
