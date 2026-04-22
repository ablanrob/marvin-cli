import type { HealthCheck, HealthContext, HealthFinding } from "../types.js";

const CHECK_ID = "no-jira-project";
const CHECK_NAME = "Jira Project Not Configured";

/** Flags projects with artifacts but no Jira project key configured. */
export const noJiraProjectCheck: HealthCheck = {
  id: CHECK_ID,
  name: CHECK_NAME,
  description: "Detects projects with artifacts but no Jira integration configured",

  run(ctx: HealthContext): HealthFinding[] {
    const counts = ctx.store.counts();
    const totalArtifacts = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (totalArtifacts === 0) return [];

    if (ctx.config.jira?.projectKey?.trim()) return [];

    return [
      {
        checkId: CHECK_ID,
        checkName: CHECK_NAME,
        severity: "observation",
        message: "No Jira project key configured for this project.",
        suggestion:
          "Add a jira.projectKey to .marvin/config.yaml to enable Jira sync and artifact push.",
      },
    ];
  },
};
