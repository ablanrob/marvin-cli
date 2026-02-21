import type { SkillDefinition } from "../../types.js";
import { createJiraTools } from "./tools.js";

export const jiraSkill: SkillDefinition = {
  id: "jira",
  name: "Jira Integration",
  description: "Bidirectional sync between Marvin artifacts and Jira issues",
  version: "1.0.0",
  format: "builtin-ts",
  // No default persona affinity — opt-in via config.yaml skills section
  documentTypeRegistrations: [
    { type: "jira-issue", dirName: "jira-issues", idPrefix: "JI" },
  ],
  tools: (store) => createJiraTools(store),
  promptFragments: {
    "product-owner": `You have the **Jira Integration** skill. You can pull issues from Jira and push Marvin artifacts to Jira.

**Available tools:**
- \`list_jira_issues\` / \`get_jira_issue\` — browse locally synced Jira issues
- \`pull_jira_issue\` / \`pull_jira_issues_jql\` — import issues from Jira by key or JQL query
- \`push_artifact_to_jira\` — create a Jira issue from a Marvin artifact (decision, feature, etc.)
- \`sync_jira_issue\` — bidirectional sync of a local JI-xxx with Jira
- \`link_artifact_to_jira\` — link a Marvin artifact to an existing JI-xxx

**As Product Owner, use Jira integration to:**
- Pull stakeholder-reported issues for triage and prioritization
- Push approved features as Stories for development tracking
- Link decisions to Jira issues for audit trail and traceability
- Use JQL queries to review backlog status (e.g. \`project = PROJ AND status = "To Do"\`)`,

    "tech-lead": `You have the **Jira Integration** skill. You can pull issues from Jira and push Marvin artifacts to Jira.

**Available tools:**
- \`list_jira_issues\` / \`get_jira_issue\` — browse locally synced Jira issues
- \`pull_jira_issue\` / \`pull_jira_issues_jql\` — import issues from Jira by key or JQL query
- \`push_artifact_to_jira\` — create a Jira issue from a Marvin artifact (decision, action, epic, etc.)
- \`sync_jira_issue\` — bidirectional sync of a local JI-xxx with Jira
- \`link_artifact_to_jira\` — link a Marvin artifact to an existing JI-xxx

**As Tech Lead, use Jira integration to:**
- Pull technical issues and bugs for sprint planning and estimation
- Push epics and technical decisions to Jira for cross-team visibility
- Bidirectional sync to keep local governance and Jira in alignment
- Use JQL queries to track technical debt (e.g. \`labels = "tech-debt" AND status != "Done"\`)`,

    "delivery-manager": `You have the **Jira Integration** skill. You can pull issues from Jira and push Marvin artifacts to Jira.

**Available tools:**
- \`list_jira_issues\` / \`get_jira_issue\` — browse locally synced Jira issues
- \`pull_jira_issue\` / \`pull_jira_issues_jql\` — import issues from Jira by key or JQL query
- \`push_artifact_to_jira\` — create a Jira issue from a Marvin artifact (decision, action, etc.)
- \`sync_jira_issue\` — bidirectional sync of a local JI-xxx with Jira
- \`link_artifact_to_jira\` — link a Marvin artifact to an existing JI-xxx

**As Delivery Manager, use Jira integration to:**
- Pull sprint issues for tracking progress and blockers
- Push actions and decisions to Jira for stakeholder visibility
- Use JQL queries for reporting (e.g. \`sprint in openSprints() AND assignee = currentUser()\`)
- Sync status between Marvin governance items and Jira issues`,
  },
};
