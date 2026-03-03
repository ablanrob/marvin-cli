import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";
import { loadUserConfig, type MarvinProjectConfig } from "../../../core/config.js";
import { createJiraClient, type JiraIssue } from "./client.js";

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
      "Create a Jira issue from any Marvin artifact (D/A/Q/F/E) and create a tracking JI-xxx document",
      {
        artifactId: z.string().describe("Marvin artifact ID (e.g. 'D-001', 'F-003', 'E-002')"),
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

        const jiDoc = store.create(
          JIRA_TYPE,
          {
            title: artifact.frontmatter.title,
            status: "open",
            jiraKey: jiraResult.key,
            jiraUrl: `https://${jira.host}/browse/${jiraResult.key}`,
            issueType: args.issueType ?? "Task",
            priority: "Medium",
            assignee: "",
            labels: [],
            linkedArtifacts: [args.artifactId],
            tags: [`jira:${jiraResult.key}`],
            lastSyncedAt: new Date().toISOString(),
          } as any,
          "",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Created Jira ${jiraResult.key} from ${args.artifactId}. Tracking locally as ${jiDoc.frontmatter.id}.`,
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
  ];
}
