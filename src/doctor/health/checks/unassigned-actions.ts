import type { HealthCheck, HealthContext, HealthFinding } from "../types.js";

const CHECK_ID = "unassigned-actions";
const CHECK_NAME = "Actions Without Sprint";

/** Flags open actions that are not assigned to any sprint. */
export const unassignedActionsCheck: HealthCheck = {
  id: CHECK_ID,
  name: CHECK_NAME,
  description: "Detects open actions not assigned to a sprint",

  run(ctx: HealthContext): HealthFinding[] {
    const counts = ctx.store.counts();
    if ((counts["sprint"] ?? 0) === 0) return []; // no-sprints check covers this

    const actions = ctx.store.list({ type: "action" });
    const openActions = actions.filter(
      (a) => a.frontmatter.status === "open" || a.frontmatter.status === "in-progress",
    );
    if (openActions.length === 0) return [];

    const unassigned = openActions.filter(
      (a) => !a.frontmatter.sprint && !a.frontmatter.tags?.some((t) => t.startsWith("sprint:")),
    );
    if (unassigned.length === 0) return [];

    return [
      {
        checkId: CHECK_ID,
        checkName: CHECK_NAME,
        severity: "recommendation",
        message: `${unassigned.length} open action(s) are not assigned to any sprint.`,
        suggestion: "Assign these actions to a sprint so they appear in delivery tracking.",
      },
    ];
  },
};
