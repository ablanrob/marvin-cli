import type { HealthCheck, HealthContext, HealthFinding } from "../types.js";

const CHECK_ID = "unprocessed-sources";
const CHECK_NAME = "Unprocessed Source Files";
const MAX_LISTED_FILES = 10;

/** Flags source files that are pending or errored. */
export const unprocessedSourcesCheck: HealthCheck = {
  id: CHECK_ID,
  name: CHECK_NAME,
  description: "Detects source files that have not been processed into artifacts",

  run(ctx: HealthContext): HealthFinding[] {
    if (!ctx.manifest) return [];

    // Manifest already scanned by engine
    const findings: HealthFinding[] = [];

    const pending = ctx.manifest.list("pending");
    if (pending.length > 0) {
      findings.push({
        checkId: CHECK_ID,
        checkName: CHECK_NAME,
        severity: "recommendation",
        message: `${pending.length} source file(s) pending processing: ${truncateNames(pending.map((f) => f.name))}`,
        suggestion: "Ingest these source files to extract artifacts from them.",
      });
    }

    const errored = ctx.manifest.list("error");
    if (errored.length > 0) {
      findings.push({
        checkId: CHECK_ID,
        checkName: CHECK_NAME,
        severity: "recommendation",
        message: `${errored.length} source file(s) failed processing: ${truncateNames(errored.map((f) => f.name))}`,
        suggestion: "Review the errors and retry processing these files.",
      });
    }

    return findings;
  },
};

function truncateNames(names: string[]): string {
  if (names.length <= MAX_LISTED_FILES) return names.join(", ");
  const shown = names.slice(0, MAX_LISTED_FILES).join(", ");
  return `${shown} ...and ${names.length - MAX_LISTED_FILES} more`;
}
