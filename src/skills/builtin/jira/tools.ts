import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";
import { loadUserConfig, type MarvinProjectConfig } from "../../../core/config.js";
import { createJiraClient, type JiraIssue } from "./client.js";
import { fetchJiraStatus, DEFAULT_ACTION_STATUS_MAP, DEFAULT_TASK_STATUS_MAP } from "./sync.js";
import { fetchJiraDaily, type DailySummary, type DailyIssueEntry } from "./daily.js";

const JIRA_TYPE = "jira-issue";

function jiraNotConfiguredError() {
  return {
    content: [
      {
        type: "text" as const,
        text: 'Jira is not configured. Run "marvin config jira" or set JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.',
      },
    ],
    isError: true,
  };
}

function mapJiraStatus(jiraStatus: string): string {
  const lower = jiraStatus.toLowerCase();
  if (lower === "done" || lower === "closed" || lower === "resolved") return "done";
  if (lower === "in progress" || lower === "in review") return "in-progress";
  return "open";
}

function jiraIssueToFrontmatter(
  issue: JiraIssue,
  host: string,
  linkedArtifacts?: string[],
) {
  return {
    title: issue.fields.summary,
    status: mapJiraStatus(issue.fields.status.name),
    jiraKey: issue.key,
    jiraUrl: `https://${host}/browse/${issue.key}`,
    issueType: issue.fields.issuetype.name,
    priority: issue.fields.priority?.name ?? "None",
    assignee: issue.fields.assignee?.displayName ?? "",
    labels: issue.fields.labels ?? [],
    linkedArtifacts: linkedArtifacts ?? [],
    tags: [`jira:${issue.key}`],
    lastSyncedAt: new Date().toISOString(),
  };
}

function findByJiraKey(store: DocumentStore, jiraKey: string) {
  const docs = store.list({ type: JIRA_TYPE });
  return docs.find((d) => d.frontmatter.jiraKey === jiraKey);
}

export function createJiraTools(
  store: DocumentStore,
  projectConfig?: MarvinProjectConfig,
): SdkMcpToolDefinition<any>[] {
  const jiraUserConfig = loadUserConfig().jira;
  const defaultProjectKey = projectConfig?.jira?.projectKey;
  const statusMap = projectConfig?.jira?.statusMap;

  return [
    // --- Local read tools ---

    tool(
      "list_jira_issues",
      "List locally synced Jira issues (JI-xxx documents), optionally filtered by status or Jira key",
      {
        status: z
          .enum(["open", "in-progress", "done"])
          .optional()
          .describe("Filter by local status"),
        jiraKey: z
          .string()
          .optional()
          .describe("Filter by Jira issue key (e.g. 'PROJ-123')"),
      },
      async (args) => {
        let docs = store.list({ type: JIRA_TYPE, status: args.status });
        if (args.jiraKey) {
          docs = docs.filter((d) => d.frontmatter.jiraKey === args.jiraKey);
        }
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          jiraKey: d.frontmatter.jiraKey,
          issueType: d.frontmatter.issueType,
          priority: d.frontmatter.priority,
          assignee: d.frontmatter.assignee,
          linkedArtifacts: d.frontmatter.linkedArtifacts,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "get_jira_issue",
      "Get the full content of a locally synced Jira issue by local ID (JI-xxx) or Jira key (PROJ-123)",
      {
        id: z.string().describe("Local ID (e.g. 'JI-001') or Jira key (e.g. 'PROJ-123')"),
      },
      async (args) => {
        let doc = store.get(args.id);
        if (!doc) {
          doc = findByJiraKey(store, args.id);
        }
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Jira issue ${args.id} not found locally` }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { ...doc.frontmatter, content: doc.content },
                null,
                2,
              ),
            },
          ],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    // --- Jira → Local tools ---

    tool(
      "pull_jira_issue",
      "Fetch a single Jira issue by key and create/update a local JI-xxx document",
      {
        key: z.string().describe("Jira issue key (e.g. 'PROJ-123')"),
      },
      async (args) => {
        const jira = createJiraClient(jiraUserConfig);
        if (!jira) return jiraNotConfiguredError();

        const issue = await jira.client.getIssue(args.key);
        const existing = findByJiraKey(store, args.key);

        if (existing) {
          const fm = jiraIssueToFrontmatter(
            issue,
            jira.host,
            existing.frontmatter.linkedArtifacts as string[],
          );
          const doc = store.update(
            existing.frontmatter.id,
            fm,
            issue.fields.description ?? "",
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Updated ${doc.frontmatter.id} from Jira ${args.key}`,
              },
            ],
          };
        }

        const fm = jiraIssueToFrontmatter(issue, jira.host);
        const doc = store.create(
          JIRA_TYPE,
          fm as any,
          issue.fields.description ?? "",
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Created ${doc.frontmatter.id} from Jira ${args.key}`,
            },
          ],
        };
      },
    ),

    tool(
      "pull_jira_issues_jql",
      "Bulk fetch Jira issues via JQL query and create/update local JI-xxx documents",
      {
        jql: z.string().describe("JQL query (e.g. 'project = PROJ AND status = \"In Progress\"')"),
        maxResults: z.number().optional().describe("Max issues to fetch (default 50)"),
      },
      async (args) => {
        const jira = createJiraClient(jiraUserConfig);
        if (!jira) return jiraNotConfiguredError();

        const result = await jira.client.searchIssues(args.jql, args.maxResults);

        const created: string[] = [];
        const updated: string[] = [];

        for (const issue of result.issues) {
          const existing = findByJiraKey(store, issue.key);

          if (existing) {
            const fm = jiraIssueToFrontmatter(
              issue,
              jira.host,
              existing.frontmatter.linkedArtifacts as string[],
            );
            store.update(
              existing.frontmatter.id,
              fm,
              issue.fields.description ?? "",
            );
            updated.push(`${existing.frontmatter.id} (${issue.key})`);
          } else {
            const fm = jiraIssueToFrontmatter(issue, jira.host);
            const doc = store.create(
              JIRA_TYPE,
              fm as any,
              issue.fields.description ?? "",
            );
            created.push(`${doc.frontmatter.id} (${issue.key})`);
          }
        }

        const parts: string[] = [
          `Fetched ${result.issues.length} of ${result.total} matching issues.`,
        ];
        if (created.length > 0) parts.push(`Created: ${created.join(", ")}`);
        if (updated.length > 0) parts.push(`Updated: ${updated.join(", ")}`);

        return {
          content: [{ type: "text" as const, text: parts.join("\n") }],
        };
      },
    ),

    // --- Local → Jira tools ---

    tool(
      "push_artifact_to_jira",
      "Create a Jira issue from any Marvin artifact and link it directly via jiraKey on the artifact.",
      {
        artifactId: z.string().describe("Marvin artifact ID (e.g. 'D-001', 'A-003', 'T-002')"),
        projectKey: z.string().optional().describe("Jira project key (e.g. 'PROJ'). Falls back to jira.projectKey from .marvin/config.yaml if not provided."),
        issueType: z
          .enum(["Story", "Task", "Bug", "Epic"])
          .optional()
          .describe("Jira issue type (default: 'Task')"),
      },
      async (args) => {
        const resolvedProjectKey = args.projectKey ?? defaultProjectKey;
        if (!resolvedProjectKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No projectKey provided and no default configured. Either pass projectKey or set jira.projectKey in .marvin/config.yaml.",
              },
            ],
            isError: true,
          };
        }

        const jira = createJiraClient(jiraUserConfig);
        if (!jira) return jiraNotConfiguredError();

        const artifact = store.get(args.artifactId);
        if (!artifact) {
          return {
            content: [
              { type: "text" as const, text: `Artifact ${args.artifactId} not found` },
            ],
            isError: true,
          };
        }

        const description = [
          artifact.content,
          "",
          `---`,
          `Marvin artifact: ${artifact.frontmatter.id} (${artifact.frontmatter.type})`,
          `Status: ${artifact.frontmatter.status}`,
        ].join("\n");

        const jiraResult = await jira.client.createIssue({
          project: { key: resolvedProjectKey },
          summary: artifact.frontmatter.title,
          description,
          issuetype: { name: args.issueType ?? "Task" },
        });

        const existingTags = (artifact.frontmatter.tags as string[]) ?? [];
        store.update(args.artifactId, {
          jiraKey: jiraResult.key,
          jiraUrl: `https://${jira.host}/browse/${jiraResult.key}`,
          lastJiraSyncAt: new Date().toISOString(),
          tags: [...existingTags.filter((t) => !t.startsWith("jira:")), `jira:${jiraResult.key}`],
        } as any);

        return {
          content: [
            {
              type: "text" as const,
              text: `Created Jira ${jiraResult.key} from ${args.artifactId}. Linked directly on the artifact.`,
            },
          ],
        };
      },
    ),

    // --- Bidirectional sync ---

    tool(
      "sync_jira_issue",
      "Bidirectional sync: push local title/description to Jira, pull latest status/assignee/labels back",
      {
        id: z.string().describe("Local JI-xxx ID"),
      },
      async (args) => {
        const jira = createJiraClient(jiraUserConfig);
        if (!jira) return jiraNotConfiguredError();

        const doc = store.get(args.id);
        if (!doc || doc.frontmatter.type !== JIRA_TYPE) {
          return {
            content: [
              { type: "text" as const, text: `Jira issue ${args.id} not found locally` },
            ],
            isError: true,
          };
        }

        const jiraKey = doc.frontmatter.jiraKey as string;

        // Push local → Jira
        await jira.client.updateIssue(jiraKey, {
          summary: doc.frontmatter.title,
          description: doc.content || undefined,
        });

        // Pull Jira → local
        const issue = await jira.client.getIssue(jiraKey);
        const fm = jiraIssueToFrontmatter(
          issue,
          jira.host,
          doc.frontmatter.linkedArtifacts as string[],
        );
        store.update(args.id, fm, issue.fields.description ?? "");

        return {
          content: [
            {
              type: "text" as const,
              text: `Synced ${args.id} ↔ ${jiraKey}. Status: ${fm.status}, Assignee: ${fm.assignee || "unassigned"}`,
            },
          ],
        };
      },
    ),

    // --- Local link tool ---

    tool(
      "link_artifact_to_jira",
      "Add a Marvin artifact ID to a JI-xxx document's linkedArtifacts field",
      {
        jiraIssueId: z.string().describe("Local JI-xxx ID"),
        artifactId: z.string().describe("Marvin artifact ID to link (e.g. 'D-001', 'F-003')"),
      },
      async (args) => {
        const doc = store.get(args.jiraIssueId);
        if (!doc || doc.frontmatter.type !== JIRA_TYPE) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Jira issue ${args.jiraIssueId} not found locally`,
              },
            ],
            isError: true,
          };
        }

        const artifact = store.get(args.artifactId);
        if (!artifact) {
          return {
            content: [
              { type: "text" as const, text: `Artifact ${args.artifactId} not found` },
            ],
            isError: true,
          };
        }

        const linked: string[] = (doc.frontmatter.linkedArtifacts as string[]) ?? [];
        if (linked.includes(args.artifactId)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${args.artifactId} is already linked to ${args.jiraIssueId}`,
              },
            ],
          };
        }

        store.update(args.jiraIssueId, {
          linkedArtifacts: [...linked, args.artifactId],
        } as any);

        return {
          content: [
            {
              type: "text" as const,
              text: `Linked ${args.artifactId} to ${args.jiraIssueId}`,
            },
          ],
        };
      },
    ),

    // --- Direct Jira linking for actions/tasks ---

    tool(
      "link_to_jira",
      "Link an existing Jira issue to any Marvin artifact (sets jiraKey directly on the artifact)",
      {
        artifactId: z.string().describe("Marvin artifact ID (e.g. 'A-001', 'D-003', 'T-002', 'Q-005')"),
        jiraKey: z.string().describe("Jira issue key (e.g. 'PROJ-123')"),
      },
      async (args) => {
        const jira = createJiraClient(jiraUserConfig);
        if (!jira) return jiraNotConfiguredError();

        const artifact = store.get(args.artifactId);
        if (!artifact) {
          return {
            content: [
              { type: "text" as const, text: `Artifact ${args.artifactId} not found` },
            ],
            isError: true,
          };
        }

        // Validate the Jira issue exists
        const issue = await jira.client.getIssue(args.jiraKey);

        const existingTags = (artifact.frontmatter.tags as string[]) ?? [];
        store.update(args.artifactId, {
          jiraKey: args.jiraKey,
          jiraUrl: `https://${jira.host}/browse/${args.jiraKey}`,
          lastJiraSyncAt: new Date().toISOString(),
          tags: [...existingTags.filter((t) => !t.startsWith("jira:")), `jira:${args.jiraKey}`],
        } as any);

        return {
          content: [
            {
              type: "text" as const,
              text: `Linked ${args.artifactId} to Jira ${args.jiraKey} ("${issue.fields.summary}").`,
            },
          ],
        };
      },
    ),

    // --- Jira status fetch (read-only) ---

    tool(
      "fetch_jira_status",
      "Fetch current Jira status for actions/tasks with jiraKey. Read-only — returns proposed changes for review. Use update_action/update_task to apply changes.",
      {
        artifactId: z.string().optional().describe("Specific artifact ID to check, or omit to check all Jira-linked actions/tasks"),
      },
      async (args) => {
        const jira = createJiraClient(jiraUserConfig);
        if (!jira) return jiraNotConfiguredError();

        const fetchResult = await fetchJiraStatus(
          store,
          jira.client,
          jira.host,
          args.artifactId,
          statusMap,
        );

        const parts: string[] = [];

        if (fetchResult.artifacts.length > 0) {
          for (const a of fetchResult.artifacts) {
            const changes: string[] = [];
            if (a.statusChanged) {
              changes.push(`status: ${a.currentMarvinStatus} → ${a.proposedMarvinStatus}`);
            }
            if (a.progressChanged) {
              changes.push(`progress: ${a.currentProgress ?? 0}% → ${a.proposedProgress}%`);
            }

            const header = `${a.id} (${a.jiraKey}) — Jira: "${a.jiraSummary}" [${a.jiraStatus}]`;
            if (changes.length > 0) {
              parts.push(`${header}\n  Proposed changes: ${changes.join(", ")}`);
            } else {
              parts.push(`${header}\n  No status/progress changes.`);
            }

            if (a.linkedIssues.length > 0) {
              const done = a.linkedIssues.filter((l) => l.isDone).length;
              parts.push(`  Linked issues (${done}/${a.linkedIssues.length} done):`);
              for (const li of a.linkedIssues) {
                const icon = li.isDone ? "✓" : "○";
                parts.push(`    ${icon} ${li.key} ${li.summary} [${li.relationship}] — ${li.status}`);
              }
            }
          }

          parts.push("");
          parts.push("This is a read-only preview. Use update_action or update_task to apply the proposed status/progress changes.");
        }

        if (fetchResult.errors.length > 0) {
          parts.push("Errors:");
          for (const err of fetchResult.errors) {
            parts.push(`  ${err}`);
          }
        }

        if (fetchResult.artifacts.length === 0 && fetchResult.errors.length === 0) {
          parts.push("No Jira-linked actions/tasks found.");
        }

        return {
          content: [{ type: "text" as const, text: parts.join("\n") }],
          isError: fetchResult.errors.length > 0 && fetchResult.artifacts.length === 0,
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    // --- Jira status discovery ---

    tool(
      "fetch_jira_statuses",
      "Fetch all distinct issue statuses from a Jira project and show which are mapped vs unmapped to Marvin statuses. Helps configure jira.statusMap in .marvin/config.yaml.",
      {
        projectKey: z.string().optional().describe("Jira project key (e.g. 'MCB1'). Falls back to jira.projectKey from config."),
        maxResults: z.number().optional().describe("Max issues to scan (default 100)"),
      },
      async (args) => {
        const resolvedProjectKey = args.projectKey ?? defaultProjectKey;
        if (!resolvedProjectKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No projectKey provided and no default configured.",
              },
            ],
            isError: true,
          };
        }

        const jira = createJiraClient(jiraUserConfig);
        if (!jira) return jiraNotConfiguredError();

        // Use v3 search/jql to get statuses
        const host = jira.host;
        const auth = "Basic " + Buffer.from(
          `${(jiraUserConfig?.email ?? process.env.JIRA_EMAIL)!}:${(jiraUserConfig?.apiToken ?? process.env.JIRA_API_TOKEN)!}`,
        ).toString("base64");

        const params = new URLSearchParams({
          jql: `project = ${resolvedProjectKey}`,
          maxResults: String(args.maxResults ?? 100),
          fields: "status",
        });

        const resp = await fetch(`https://${host}/rest/api/3/search/jql?${params}`, {
          headers: { Authorization: auth, Accept: "application/json" },
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          return {
            content: [
              {
                type: "text" as const,
                text: `Jira API error ${resp.status}: ${text}`,
              },
            ],
            isError: true,
          };
        }

        const data = (await resp.json()) as { total: number; issues: { fields: { status: { name: string } } }[] };

        // Collect distinct statuses
        const statusCounts = new Map<string, number>();
        for (const issue of data.issues) {
          const s = issue.fields.status.name;
          statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
        }

        // Build effective maps
        const actionMap = statusMap?.action ?? DEFAULT_ACTION_STATUS_MAP;
        const taskMap = statusMap?.task ?? DEFAULT_TASK_STATUS_MAP;

        const actionLookup = new Map<string, string>();
        for (const [marvin, jiraStatuses] of Object.entries(actionMap)) {
          for (const js of jiraStatuses) actionLookup.set(js.toLowerCase(), marvin);
        }
        const taskLookup = new Map<string, string>();
        for (const [marvin, jiraStatuses] of Object.entries(taskMap)) {
          for (const js of jiraStatuses) taskLookup.set(js.toLowerCase(), marvin);
        }

        const parts: string[] = [
          `Found ${statusCounts.size} distinct statuses in ${resolvedProjectKey} (scanned ${data.issues.length} of ${data.total} issues):`,
          "",
        ];

        const sorted = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]);
        const unmappedAction: string[] = [];
        const unmappedTask: string[] = [];

        for (const [status, count] of sorted) {
          const actionTarget = actionLookup.get(status.toLowerCase());
          const taskTarget = taskLookup.get(status.toLowerCase());
          const actionLabel = actionTarget ? `→ ${actionTarget}` : "UNMAPPED (→ open)";
          const taskLabel = taskTarget ? `→ ${taskTarget}` : "UNMAPPED (→ backlog)";
          parts.push(`  ${status} (${count} issues)`);
          parts.push(`    action: ${actionLabel}`);
          parts.push(`    task:   ${taskLabel}`);
          if (!actionTarget) unmappedAction.push(status);
          if (!taskTarget) unmappedTask.push(status);
        }

        if (unmappedAction.length > 0 || unmappedTask.length > 0) {
          parts.push("");
          parts.push("To fix unmapped statuses, add jira.statusMap to .marvin/config.yaml:");
          parts.push("  jira:");
          parts.push("    statusMap:");
          if (unmappedAction.length > 0) {
            parts.push("      action:");
            parts.push(`        # Map these: ${unmappedAction.join(", ")}`);
            parts.push("        # <marvin-status>: [<jira-status>, ...]");
          }
          if (unmappedTask.length > 0) {
            parts.push("      task:");
            parts.push(`        # Map these: ${unmappedTask.join(", ")}`);
            parts.push("        # <marvin-status>: [<jira-status>, ...]");
          }
        } else {
          parts.push("");
          parts.push("All statuses are mapped.");
        }

        const usingConfig = statusMap?.action || statusMap?.task;
        parts.push("");
        parts.push(usingConfig ? "Using status maps from .marvin/config.yaml." : "Using built-in default status maps (no jira.statusMap in config).");

        return {
          content: [{ type: "text" as const, text: parts.join("\n") }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    // --- Jira daily summary ---

    tool(
      "fetch_jira_daily",
      "Fetch a daily summary of Jira changes: status transitions, comments, linked Confluence pages, and cross-referenced Marvin artifacts. Read-only — returns proposed actions for review.",
      {
        from: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to today."),
        to: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to same as 'from'."),
        projectKey: z.string().optional().describe("Jira project key. Falls back to jira.projectKey from config."),
      },
      async (args) => {
        const resolvedProjectKey = args.projectKey ?? defaultProjectKey;
        if (!resolvedProjectKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No projectKey provided and no default configured.",
              },
            ],
            isError: true,
          };
        }

        const jira = createJiraClient(jiraUserConfig);
        if (!jira) return jiraNotConfiguredError();

        const today = new Date().toISOString().slice(0, 10);
        const fromDate = args.from ?? today;
        const toDate = args.to ?? fromDate;

        const daily = await fetchJiraDaily(
          store,
          jira.client,
          jira.host,
          resolvedProjectKey,
          { from: fromDate, to: toDate },
          statusMap,
        );

        return {
          content: [{ type: "text" as const, text: formatDailySummary(daily) }],
          isError: daily.errors.length > 0 && daily.issues.length === 0,
        };
      },
      { annotations: { readOnlyHint: true } },
    ),
  ];
}

function formatDailySummary(daily: DailySummary): string {
  const parts: string[] = [];
  const rangeLabel =
    daily.dateRange.from === daily.dateRange.to
      ? daily.dateRange.from
      : `${daily.dateRange.from} to ${daily.dateRange.to}`;

  parts.push(`Jira Daily Summary — ${daily.projectKey} — ${rangeLabel}`);
  parts.push(`${daily.issues.length} issue(s) updated.\n`);

  // Group issues by those with Marvin artifacts and those without
  const linked = daily.issues.filter((i) => i.marvinArtifacts.length > 0);
  const unlinked = daily.issues.filter((i) => i.marvinArtifacts.length === 0);

  if (linked.length > 0) {
    parts.push("## Linked Issues (with Marvin artifacts)\n");
    for (const issue of linked) {
      parts.push(formatIssueEntry(issue));
    }
  }

  if (unlinked.length > 0) {
    parts.push("## Unlinked Issues (no Marvin artifact)\n");
    for (const issue of unlinked) {
      parts.push(formatIssueEntry(issue));
    }
  }

  if (daily.proposedActions.length > 0) {
    parts.push("## Proposed Actions\n");
    for (const action of daily.proposedActions) {
      const icon =
        action.type === "status-update" ? "↻" :
        action.type === "unlinked-issue" ? "+" :
        action.type === "link-suggestion" ? "🔗" :
        action.type === "question-candidate" ? "?" :
        action.type === "decision-candidate" ? "⚖" :
        action.type === "blocker-detected" ? "🚫" :
        action.type === "resolution-detected" ? "✓" :
        "📄";
      parts.push(`  ${icon} ${action.description}`);
    }
    parts.push("");
    parts.push("These are suggestions. Use update_action, update_task, or other tools to apply changes.");
  }

  if (daily.errors.length > 0) {
    parts.push("\n## Errors\n");
    for (const err of daily.errors) {
      parts.push(`  ${err}`);
    }
  }

  return parts.join("\n");
}

function formatIssueEntry(issue: DailyIssueEntry): string {
  const lines: string[] = [];
  const artifacts = issue.marvinArtifacts.map((a) => a.id).join(", ");
  const artifactLabel = artifacts ? ` → ${artifacts}` : "";

  lines.push(`### ${issue.key} — ${issue.summary} [${issue.currentStatus}]${artifactLabel}`);
  lines.push(`  Type: ${issue.issueType} | Assignee: ${issue.assignee ?? "unassigned"}`);

  // Status drift
  for (const a of issue.marvinArtifacts) {
    if (a.statusDrift) {
      lines.push(`  ⚠ ${a.id} status drift: Marvin="${a.currentStatus}" vs proposed="${a.proposedStatus}"`);
    }
  }

  // Changes
  if (issue.changes.length > 0) {
    lines.push("  Changes:");
    for (const c of issue.changes) {
      lines.push(`    ${c.field}: ${c.from ?? "∅"} → ${c.to ?? "∅"} (${c.author}, ${c.timestamp.slice(0, 16)})`);
    }
  }

  // Comments
  if (issue.comments.length > 0) {
    lines.push(`  Comments (${issue.comments.length}):`);
    for (const c of issue.comments) {
      let signalIcons = "";
      if (c.signals.length > 0) {
        const icons = c.signals.map((s) =>
          s.type === "blocker" ? "🚫" :
          s.type === "decision" ? "⚖" :
          s.type === "question" ? "?" :
          "✓"
        );
        signalIcons = ` [${icons.join("")}]`;
      }
      lines.push(`    ${c.author} (${c.created.slice(0, 16)})${signalIcons}: ${c.bodyPreview}`);
    }
  }

  // Link suggestions
  if (issue.linkSuggestions.length > 0) {
    lines.push("  Possible Marvin matches:");
    for (const s of issue.linkSuggestions) {
      lines.push(`    🔗 ${s.artifactId} ("${s.artifactTitle}") — ${Math.round(s.score * 100)}% match [${s.sharedTerms.join(", ")}]`);
    }
  }

  // Linked issues
  if (issue.linkedIssues.length > 0) {
    lines.push("  Linked issues:");
    for (const li of issue.linkedIssues) {
      const icon = li.isDone ? "✓" : "○";
      lines.push(`    ${icon} ${li.key} ${li.summary} [${li.relationship}] — ${li.status}`);
    }
  }

  // Confluence links
  if (issue.confluenceLinks.length > 0) {
    lines.push("  Confluence pages:");
    for (const cl of issue.confluenceLinks) {
      lines.push(`    📄 ${cl.title}: ${cl.url}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
