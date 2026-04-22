import type { HealthCheck, HealthContext, HealthFinding } from "../types.js";

const CHECK_ID = "unprocessed-sources";
const CHECK_NAME = "Unprocessed Source Files";

/** Flags source files that are pending or errored. */
export const unprocessedSourcesCheck: HealthCheck = {
  id: CHECK_ID,
  name: CHECK_NAME,
  description: "Detects source files that have not been processed into artifacts",

  run(ctx: HealthContext): HealthFinding[] {
    if (!ctx.manifest) return [];

    try {
      ctx.manifest.scan();
    } catch {
      return [];
    }

    const findings: HealthFinding[] = [];

    const pending = ctx.manifest.list("pending");
    if (pending.length > 0) {
      const names = pending.map((f) => f.name).join(", ");
      findings.push({
        checkId: CHECK_ID,
        checkName: CHECK_NAME,
        severity: "recommendation",
        message: `${pending.length} source file(s) pending processing: ${names}`,
        suggestion: "Ingest these source files to extract artifacts from them.",
      });
    }

    const errored = ctx.manifest.list("error");
    if (errored.length > 0) {
      const names = errored.map((f) => f.name).join(", ");
      findings.push({
        checkId: CHECK_ID,
        checkName: CHECK_NAME,
        severity: "recommendation",
        message: `${errored.length} source file(s) failed processing: ${names}`,
        suggestion: "Review the errors and retry processing these files.",
      });
    }

    return findings;
  },
};
