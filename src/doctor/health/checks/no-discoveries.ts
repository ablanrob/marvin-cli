import type { HealthCheck, HealthContext, HealthFinding } from "../types.js";

const CHECK_ID = "no-discoveries";
const CHECK_NAME = "Missing Discovery Sessions";

/** Flags projects that have features but no discovery sessions. */
export const noDiscoveriesCheck: HealthCheck = {
  id: CHECK_ID,
  name: CHECK_NAME,
  description: "Detects projects with features but no discovery sessions to validate requirements",

  run(ctx: HealthContext): HealthFinding[] {
    const counts = ctx.store.counts();

    const featureCount = counts["feature"] ?? 0;
    if (featureCount === 0) return [];

    const hasDiscoveries = (counts["discovery"] ?? 0) > 0;
    if (hasDiscoveries) return [];

    return [
      {
        checkId: CHECK_ID,
        checkName: CHECK_NAME,
        severity: "recommendation",
        message: `Project has ${featureCount} feature(s) but no discovery sessions.`,
        suggestion:
          "Consider conducting discovery sessions with stakeholders to validate requirements and identify gaps before refinement.",
      },
    ];
  },
};
