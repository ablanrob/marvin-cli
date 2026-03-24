import type { DocumentStore } from "../../../storage/store.js";
import type { JiraClient } from "./client.js";
import type { JiraStatusMap, ConditionalJiraStatusEntry } from "../../../core/config.js";
import {
  propagateProgressFromTask,
  propagateProgressToAction,
} from "../../../storage/progress.js";

const DONE_STATUSES = new Set(["done", "closed", "resolved", "obsolete", "wont do"]);

const DEFAULT_ACTION_STATUS_MAP: JiraStatusMap = {
  done: ["Done", "Closed", "Resolved", "Obsolete", "Wont Do"],
  "in-progress": ["In Progress", "In Review", "Reviewing", "Testing"],
  blocked: ["Blocked"],
  open: ["To Do", "Open", "Backlog", "New"],
};

const DEFAULT_TASK_STATUS_MAP: JiraStatusMap = {
  done: ["Done", "Closed", "Resolved", "Obsolete", "Wont Do"],
  review: ["In Review", "Code Review", "Reviewing", "Testing"],
  "in-progress": ["In Progress"],
  ready: ["Ready", "Selected for Development"],
  blocked: ["Blocked"],
  backlog: ["To Do", "Open", "Backlog", "New"],
};

/**
 * Check whether a value is a conditional status entry (object with `default` key)
 * vs a simple string array.
 */
function isConditionalEntry(value: string[] | ConditionalJiraStatusEntry): value is ConditionalJiraStatusEntry {
  return !Array.isArray(value) && typeof value === "object" && "default" in value;
}

/**
 * Build a lookup from Jira status (lowercased) → Marvin status using a status map.
 * When `inSprint` is true, conditional entries' `inSprint` arrays override `default` entries.
 */
function buildStatusLookup(
  configMap: JiraStatusMap | undefined,
  defaults: JiraStatusMap,
  inSprint: boolean = false,
): Map<string, string> {
  const map = configMap ?? defaults;
  const lookup = new Map<string, string>();

  // First pass: add default/simple mappings
  for (const [marvinStatus, value] of Object.entries(map)) {
    const statuses = isConditionalEntry(value) ? value.default : value;
    for (const js of statuses) {
      lookup.set(js.toLowerCase(), marvinStatus);
    }
  }

  // Second pass: if in sprint, override with inSprint mappings
  if (inSprint) {
    for (const [marvinStatus, value] of Object.entries(map)) {
      if (isConditionalEntry(value) && value.inSprint) {
        for (const js of value.inSprint) {
          lookup.set(js.toLowerCase(), marvinStatus);
        }
      }
    }
  }

  return lookup;
}

export function mapJiraStatusForAction(status: string, configMap?: JiraStatusMap, inSprint?: boolean): string {
  const lookup = buildStatusLookup(configMap, DEFAULT_ACTION_STATUS_MAP, inSprint ?? false);
  return lookup.get(status.toLowerCase()) ?? "open";
}

export function mapJiraStatusForTask(status: string, configMap?: JiraStatusMap, inSprint?: boolean): string {
  const lookup = buildStatusLookup(configMap, DEFAULT_TASK_STATUS_MAP, inSprint ?? false);
  return lookup.get(status.toLowerCase()) ?? "backlog";
}

/**
 * Determine if an artifact is in an active or completed sprint.
 * Checks the artifact's `sprint:SP-xxx` tags against sprint documents in the store.
 */
export function isInActiveSprint(store: DocumentStore, tags: string[] | undefined): boolean {
  if (!tags) return false;
  const sprintTags = tags.filter(t => t.startsWith("sprint:"));
  if (sprintTags.length === 0) return false;

  for (const tag of sprintTags) {
    const sprintId = tag.slice(7); // Remove "sprint:" prefix
    const sprintDoc = store.get(sprintId);
    if (sprintDoc) {
      const status = sprintDoc.frontmatter.status;
      if (status === "active" || status === "completed") {
        return true;
      }
    }
  }
  return false;
}

export { DEFAULT_ACTION_STATUS_MAP, DEFAULT_TASK_STATUS_MAP };

/**
 * Extract a Jira key from a tags array using the `jira:KEY` convention.
 */
export function extractJiraKeyFromTags(tags: string[] | undefined): string | undefined {
  if (!tags) return undefined;
  const tag = tags.find(t => /^jira:[A-Z]+-\d+$/i.test(t));
  return tag ? tag.slice(5) : undefined;
}

export interface LinkedIssueSummary {
  key: string;
  summary: string;
  status: string;
  relationship: string;
  isDone: boolean;
}

export interface FetchedArtifactStatus {
  id: string;
  type: string;
  jiraKey: string;
  jiraUrl: string;
  jiraSummary: string;
  jiraStatus: string;
  currentMarvinStatus: string;
  proposedMarvinStatus: string;
  statusChanged: boolean;
  currentProgress: number | undefined;
  proposedProgress: number | undefined;
  progressChanged: boolean;
  linkedIssues: LinkedIssueSummary[];
}

export interface FetchResult {
  artifacts: FetchedArtifactStatus[];
  errors: string[];
}

export interface SyncResultEntry {
  id: string;
  jiraKey: string;
  oldStatus: string;
  newStatus: string;
  linkedIssues: LinkedIssueSummary[];
}

export interface SyncResult {
  updated: SyncResultEntry[];
  unchanged: number;
  errors: string[];
}

export function computeSubtaskProgress(
  subtasks: { fields: { status: { name: string } } }[],
): number {
  if (subtasks.length === 0) return 0;
  const done = subtasks.filter((s) =>
    DONE_STATUSES.has(s.fields.status.name.toLowerCase()),
  ).length;
  return Math.round((done / subtasks.length) * 100);
}

/**
 * Read-only: fetches Jira status for linked artifacts without modifying anything.
 * Returns proposed changes for the agent/user to review.
 */
export async function fetchJiraStatus(
  store: DocumentStore,
  client: JiraClient,
  host: string,
  artifactId?: string,
  statusMap?: { action?: JiraStatusMap; task?: JiraStatusMap },
): Promise<FetchResult> {
  const result: FetchResult = { artifacts: [], errors: [] };

  const actions = store.list({ type: "action" });
  const tasks = store.list({ type: "task" });
  let candidates = [...actions, ...tasks].filter(
    (d) => d.frontmatter.jiraKey,
  );

  if (artifactId) {
    candidates = candidates.filter((d) => d.frontmatter.id === artifactId);
    if (candidates.length === 0) {
      const doc = store.get(artifactId);
      if (doc) {
        result.errors.push(
          `${artifactId} has no jiraKey — use push_artifact_to_jira or link_to_jira first`,
        );
      } else {
        result.errors.push(`Artifact ${artifactId} not found`);
      }
      return result;
    }
  }

  // Skip already-done artifacts
  candidates = candidates.filter(
    (d) => !DONE_STATUSES.has(d.frontmatter.status),
  );

  for (const doc of candidates) {
    const jiraKey = doc.frontmatter.jiraKey as string;
    const artifactType = doc.frontmatter.type;

    try {
      const issue = await client.getIssueWithLinks(jiraKey);

      const inSprint = isInActiveSprint(store, doc.frontmatter.tags as string[] | undefined);
      const proposedStatus =
        artifactType === "task"
          ? mapJiraStatusForTask(issue.fields.status.name, statusMap?.task, inSprint)
          : mapJiraStatusForAction(issue.fields.status.name, statusMap?.action, inSprint);
      const currentStatus = doc.frontmatter.status;

      // Collect linked issues
      const linkedIssues: LinkedIssueSummary[] = [];

      if (issue.fields.subtasks) {
        for (const sub of issue.fields.subtasks) {
          linkedIssues.push({
            key: sub.key,
            summary: sub.fields.summary,
            status: sub.fields.status.name,
            relationship: "subtask",
            isDone: DONE_STATUSES.has(sub.fields.status.name.toLowerCase()),
          });
        }
      }

      if (issue.fields.issuelinks) {
        for (const link of issue.fields.issuelinks) {
          if (link.outwardIssue) {
            linkedIssues.push({
              key: link.outwardIssue.key,
              summary: link.outwardIssue.fields.summary,
              status: link.outwardIssue.fields.status.name,
              relationship: link.type.outward,
              isDone: DONE_STATUSES.has(
                link.outwardIssue.fields.status.name.toLowerCase(),
              ),
            });
          }
          if (link.inwardIssue) {
            linkedIssues.push({
              key: link.inwardIssue.key,
              summary: link.inwardIssue.fields.summary,
              status: link.inwardIssue.fields.status.name,
              relationship: link.type.inward,
              isDone: DONE_STATUSES.has(
                link.inwardIssue.fields.status.name.toLowerCase(),
              ),
            });
          }
        }
      }

      // Compute proposed progress from subtasks
      const subtasks = issue.fields.subtasks ?? [];
      let proposedProgress: number | undefined;
      if (subtasks.length > 0 && !doc.frontmatter.progressOverride) {
        proposedProgress = computeSubtaskProgress(subtasks);
      }

      const currentProgress = doc.frontmatter.progress as number | undefined;

      result.artifacts.push({
        id: doc.frontmatter.id,
        type: artifactType,
        jiraKey,
        jiraUrl: `https://${host}/browse/${jiraKey}`,
        jiraSummary: issue.fields.summary,
        jiraStatus: issue.fields.status.name,
        currentMarvinStatus: currentStatus,
        proposedMarvinStatus: proposedStatus,
        statusChanged: currentStatus !== proposedStatus,
        currentProgress,
        proposedProgress,
        progressChanged:
          proposedProgress !== undefined && proposedProgress !== currentProgress,
        linkedIssues,
      });
    } catch (err) {
      result.errors.push(
        `${doc.frontmatter.id} (${jiraKey}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

/**
 * Write mode: fetches Jira status and applies changes to artifacts.
 * Used by the CLI command.
 */
export async function syncJiraProgress(
  store: DocumentStore,
  client: JiraClient,
  host: string,
  artifactId?: string,
  statusMap?: { action?: JiraStatusMap; task?: JiraStatusMap },
): Promise<SyncResult> {
  const fetchResult = await fetchJiraStatus(store, client, host, artifactId, statusMap);
  const result: SyncResult = {
    updated: [],
    unchanged: 0,
    errors: [...fetchResult.errors],
  };

  for (const artifact of fetchResult.artifacts) {
    const hasChanges =
      artifact.statusChanged ||
      artifact.progressChanged ||
      artifact.linkedIssues.length > 0;

    if (hasChanges) {
      const updates: Record<string, unknown> = {
        status: artifact.proposedMarvinStatus,
        lastJiraSyncAt: new Date().toISOString(),
        jiraLinkedIssues: artifact.linkedIssues,
      };

      if (artifact.proposedProgress !== undefined) {
        updates.progress = artifact.proposedProgress;
      }

      store.update(artifact.id, updates as any);

      // Propagate progress
      if (artifact.type === "task") {
        propagateProgressFromTask(store, artifact.id);
      } else if (artifact.type === "action") {
        propagateProgressToAction(store, artifact.id);
      }

      result.updated.push({
        id: artifact.id,
        jiraKey: artifact.jiraKey,
        oldStatus: artifact.currentMarvinStatus,
        newStatus: artifact.proposedMarvinStatus,
        linkedIssues: artifact.linkedIssues,
      });
    } else {
      // Still update the sync timestamp
      store.update(artifact.id, {
        lastJiraSyncAt: new Date().toISOString(),
      } as any);
      result.unchanged++;
    }
  }

  return result;
}
