import type { SkillDefinition } from "../../types.js";
import { createJiraTools } from "./tools.js";

const COMMON_TOOLS = `**Available tools:**
- \`push_artifact_to_jira\` — create a Jira issue from any Marvin artifact and link it directly via \`jiraKey\` on the artifact.
- \`link_to_jira\` — link an existing Jira issue to any Marvin artifact (sets \`jiraKey\` directly on the artifact).
- \`link_to_confluence\` — link a Confluence page to any Marvin artifact. Validates the page exists and fetches its title.
- \`read_confluence_page\` — **read-only**: fetch and return the content of a Confluence page by URL or page ID. Use this to review Confluence content for updating tasks, generating contributions, or answering questions.
- \`fetch_jira_status\` — **read-only**: fetch current Jira status, subtask progress, and linked issues for Jira-linked actions/tasks. Returns proposed changes without applying them.
- \`fetch_jira_daily\` — **read-only**: fetch a daily/range summary of all Jira changes — status transitions, comments, linked Confluence pages, and cross-references with Marvin artifacts. Returns proposed actions (status updates, unlinked issues, question candidates, Confluence pages to review).
- \`fetch_jira_statuses\` — **read-only**: discover all Jira statuses in a project and show their Marvin mappings (mapped vs unmapped).
- \`search_jira\` — **read-only**: search Jira via JQL and return results with Marvin cross-references. No documents created — use to preview before importing or find issues for linking.
- \`pull_jira_issue\` / \`pull_jira_issues_jql\` — import Jira issues as local JI-xxx documents (for Jira-originated items with no existing Marvin artifact).
- \`list_jira_issues\` / \`get_jira_issue\` — browse locally imported JI-xxx documents.
- \`sync_jira_issue\` — bidirectional sync of a local JI-xxx with Jira.
- \`link_artifact_to_jira\` — link a Marvin artifact to an existing JI-xxx document.`;

const COMMON_WORKFLOW = `**Jira sync workflow:**
1. Call \`fetch_jira_status\` to see what Jira reports for linked artifacts
2. Analyze the proposed changes (status transitions, subtask progress, blockers from linked issues)
3. Use \`update_action\` / \`update_task\` to apply the changes you agree with

**Daily review workflow:**
1. Call \`fetch_jira_daily\` (optionally with \`from\`/\`to\` date range) to get a summary of all Jira activity
2. Review the proposed actions: status updates, unlinked issues to track, questions that may be answered, Confluence pages to review
3. Use existing tools to apply changes, create new artifacts, or link untracked issues`;

export const jiraSkill: SkillDefinition = {
  id: "jira",
  name: "Jira Integration",
  description: "Bidirectional sync between Marvin artifacts and Jira issues",
  version: "1.0.0",
  format: "builtin-ts",
  documentTypeRegistrations: [
    { type: "jira-issue", dirName: "jira-issues", idPrefix: "JI" },
  ],
  tools: (store, projectConfig) => createJiraTools(store, projectConfig),
  promptFragments: {
    "product-owner": `You have the **Jira Integration** skill.

${COMMON_TOOLS}

${COMMON_WORKFLOW}

**As Product Owner, use Jira integration to:**
- Use \`fetch_jira_daily\` for daily standups — review what changed, identify status drift, spot untracked work
- Pull stakeholder-reported issues for triage and prioritization
- Push approved features as Stories for development tracking
- Link decisions to Jira issues for audit trail and traceability
- Use \`fetch_jira_statuses\` when setting up a new project to configure status mappings`,

    "tech-lead": `You have the **Jira Integration** skill.

${COMMON_TOOLS}

${COMMON_WORKFLOW}

**As Tech Lead, use Jira integration to:**
- Use \`fetch_jira_daily\` to review technical progress — status transitions, new comments, Confluence design docs
- Pull technical issues and bugs for sprint planning and estimation
- Push epics, tasks, and technical decisions to Jira for cross-team visibility
- Use \`link_to_jira\` to connect Marvin tasks to existing Jira tickets
- Use \`fetch_jira_statuses\` to verify status mappings match the team's Jira workflow`,

    "delivery-manager": `You have the **Jira Integration** skill.

${COMMON_TOOLS}

${COMMON_WORKFLOW}
This is a third path for progress tracking alongside Contributions and Meetings.

**As Delivery Manager, use Jira integration to:**
- Use \`fetch_jira_daily\` for daily progress reports — track what moved, identify blockers, spot untracked work
- Pull sprint issues for tracking progress and blockers
- Push actions and tasks to Jira for stakeholder visibility
- Use \`fetch_jira_daily\` with a date range for sprint retrospectives (e.g. \`from: "2026-03-10", to: "2026-03-21"\`)
- Use \`fetch_jira_statuses\` to ensure Jira workflow statuses are properly mapped`,
  },
};
