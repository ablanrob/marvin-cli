import type { HealthCheck, HealthContext, HealthFinding } from "../types.js";

const CHECK_ID = "no-sprints";
const CHECK_NAME = "Missing Sprint Setup";

/** Flags projects that have actionable work but no sprints defined. */
export const noSprintsCheck: HealthCheck = {
  id: CHECK_ID,
  name: CHECK_NAME,
  description: "Detects projects with actions or epics but no sprints defined",

  run(ctx: HealthContext): HealthFinding[] {
    const counts = ctx.store.counts();

    const hasWork = (counts["action"] ?? 0) > 0 || (counts["epic"] ?? 0) > 0;
    if (!hasWork) return [];

    const hasSprints = (counts["sprint"] ?? 0) > 0;
    if (hasSprints) return [];

    const actionCount = counts["action"] ?? 0;
    const epicCount = counts["epic"] ?? 0;
    const parts: string[] = [];
    if (actionCount > 0) parts.push(`${actionCount} action(s)`);
    if (epicCount > 0) parts.push(`${epicCount} epic(s)`);

    return [
      {
        checkId: CHECK_ID,
        checkName: CHECK_NAME,
        severity: "recommendation",
        message: `Project has ${parts.join(" and ")} but no sprints defined.`,
        suggestion:
          "Consider setting up a Sprint 0 to organize bootstrapping work, then plan Sprint 1 for delivery.",
      },
    ];
  },
};
