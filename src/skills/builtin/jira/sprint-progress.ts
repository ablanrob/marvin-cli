import { query } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";
import type { JiraClient, JiraComment } from "./client.js";
import type { JiraStatusMap } from "../../../core/config.js";
import type { LinkedIssueSummary } from "./sync.js";
import {
  mapJiraStatusForAction,
  mapJiraStatusForTask,
  computeSubtaskProgress,
  extractJiraKeyFromTags,
} from "./sync.js";
import {
  detectCommentSignals,
  extractCommentText,
  type CommentSignal,
} from "./daily.js";
import { collectSprintSummaryData } from "../../../reports/sprint-summary/collector.js";
import {
  propagateProgressFromTask,
  propagateProgressToAction,
} from "../../../storage/progress.js";
import { getEffectiveProgress } from "../../../storage/progress.js";

// --- Types ---

export interface SprintProgressItemReport {
  id: string;
  title: string;
  type: string;
  marvinStatus: string;
  marvinProgress: number;
  jiraKey: string | null;
  jiraStatus: string | null;
  jiraSubtaskProgress: number | null;
  proposedMarvinStatus: string | null;
  statusDrift: boolean;
  progressDrift: boolean;
  commentSignals: CommentSignal[];
  commentSummary: string | null;
  children: SprintProgressItemReport[];
  owner: string | null;
  focusArea: string | null;
}

export interface FocusAreaRollup {
  name: string;
  items: SprintProgressItemReport[];
  totalCount: number;
  doneCount: number;
  blockedCount: number;
  avgProgress: number;
}

export interface ProposedUpdate {
  artifactId: string;
  field: string;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
}

export interface SprintProgressReport {
  sprintId: string;
  sprintTitle: string;
  generatedAt: string;
  timeline: {
    startDate: string | null;
    endDate: string | null;
    daysRemaining: number;
    totalDays: number;
    percentComplete: number;
  };
  overallProgress: number;
  itemReports: SprintProgressItemReport[];
  focusAreas: FocusAreaRollup[];
  driftItems: SprintProgressItemReport[];
  blockers: SprintProgressItemReport[];
  proposedUpdates: ProposedUpdate[];
  appliedUpdates: ProposedUpdate[];
  errors: string[];
}

// --- Constants ---

const DONE_STATUSES = new Set(["done", "closed", "resolved", "obsolete", "wont do", "cancelled"]);
const BATCH_SIZE = 5;

// --- Core function ---

export interface AssessSprintProgressOptions {
  sprintId?: string;
  analyzeComments?: boolean;
  applyUpdates?: boolean;
  statusMap?: { action?: JiraStatusMap; task?: JiraStatusMap };
}

export async function assessSprintProgress(
  store: DocumentStore,
  client: JiraClient,
  host: string,
  options: AssessSprintProgressOptions = {},
): Promise<SprintProgressReport> {
  const errors: string[] = [];

  // 1. Gather sprint data using existing collector
  const sprintData = collectSprintSummaryData(store, options.sprintId);
  if (!sprintData) {
    return {
      sprintId: options.sprintId ?? "unknown",
      sprintTitle: "Sprint not found",
      generatedAt: new Date().toISOString(),
      timeline: { startDate: null, endDate: null, daysRemaining: 0, totalDays: 0, percentComplete: 0 },
      overallProgress: 0,
      itemReports: [],
      focusAreas: [],
      driftItems: [],
      blockers: [],
      proposedUpdates: [],
      appliedUpdates: [],
      errors: [`Sprint ${options.sprintId ?? "(active)"} not found. Create a sprint artifact first.`],
    };
  }

  // 2. Gather sprint-tagged items (actions + tasks)
  const sprintTag = `sprint:${sprintData.sprint.id}`;
  const actions = store.list({ type: "action", tag: sprintTag });
  const tasks = store.list({ type: "task", tag: sprintTag });

  // Also include tasks/actions nested under sprint-tagged parents via aboutArtifact
  const sprintItemIds = new Set([...actions, ...tasks].map(d => d.frontmatter.id));
  const allTasks = store.list({ type: "task" });
  const allActions = store.list({ type: "action" });
  const nestedTasks = allTasks.filter(
    d => !sprintItemIds.has(d.frontmatter.id) &&
      d.frontmatter.aboutArtifact &&
      sprintItemIds.has(d.frontmatter.aboutArtifact as string),
  );
  const nestedActions = allActions.filter(
    d => !sprintItemIds.has(d.frontmatter.id) &&
      d.frontmatter.aboutArtifact &&
      sprintItemIds.has(d.frontmatter.aboutArtifact as string),
  );

  const allItems = [...actions, ...tasks, ...nestedTasks, ...nestedActions];

  // 3. Resolve Jira keys
  const itemJiraKeys = new Map<string, string>();
  for (const doc of allItems) {
    const jiraKey = (doc.frontmatter.jiraKey as string | undefined)
      ?? extractJiraKeyFromTags(doc.frontmatter.tags as string[] | undefined);
    if (jiraKey) {
      itemJiraKeys.set(doc.frontmatter.id, jiraKey);
    }
  }

  // 4. Bulk Jira fetch in batches of 5
  const jiraKeys = [...new Set(itemJiraKeys.values())];
  const jiraIssues = new Map<string, { issue: any; comments: JiraComment[] }>();

  for (let i = 0; i < jiraKeys.length; i += BATCH_SIZE) {
    const batch = jiraKeys.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (key) => {
        const [issue, comments] = await Promise.all([
          client.getIssueWithLinks(key),
          client.getComments(key),
        ]);
        return { key, issue, comments };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        jiraIssues.set(result.value.key, {
          issue: result.value.issue,
          comments: result.value.comments,
        });
      } else {
        const batchKey = batch[results.indexOf(result)];
        errors.push(`Failed to fetch ${batchKey}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      }
    }
  }

  // 5. Per-item enrichment
  const proposedUpdates: ProposedUpdate[] = [];
  const itemReports: SprintProgressItemReport[] = [];
  const childReportsByParent = new Map<string, SprintProgressItemReport[]>();

  for (const doc of allItems) {
    const fm = doc.frontmatter;
    const jiraKey = itemJiraKeys.get(fm.id) ?? null;
    const jiraData = jiraKey ? jiraIssues.get(jiraKey) : null;

    let jiraStatus: string | null = null;
    let proposedMarvinStatus: string | null = null;
    let jiraSubtaskProgress: number | null = null;
    const commentSignals: CommentSignal[] = [];

    if (jiraData) {
      jiraStatus = jiraData.issue.fields.status.name;

      // Map Jira status to Marvin status
      proposedMarvinStatus = fm.type === "task"
        ? mapJiraStatusForTask(jiraStatus, options.statusMap?.task)
        : mapJiraStatusForAction(jiraStatus, options.statusMap?.action);

      // Compute subtask progress
      const subtasks = jiraData.issue.fields.subtasks ?? [];
      if (subtasks.length > 0) {
        jiraSubtaskProgress = computeSubtaskProgress(subtasks);
      }

      // Extract comment signals
      for (const comment of jiraData.comments) {
        const text = extractCommentText(comment.body);
        const signals = detectCommentSignals(text);
        commentSignals.push(...signals);
      }
    }

    const statusDrift = proposedMarvinStatus !== null && proposedMarvinStatus !== fm.status;
    const currentProgress = getEffectiveProgress(fm);
    const progressDrift = jiraSubtaskProgress !== null &&
      !fm.progressOverride &&
      jiraSubtaskProgress !== currentProgress;

    // Build proposed updates
    if (statusDrift && proposedMarvinStatus) {
      proposedUpdates.push({
        artifactId: fm.id,
        field: "status",
        currentValue: fm.status,
        proposedValue: proposedMarvinStatus,
        reason: `Jira ${jiraKey} is "${jiraStatus}" → maps to "${proposedMarvinStatus}"`,
      });
    }
    if (progressDrift && jiraSubtaskProgress !== null) {
      proposedUpdates.push({
        artifactId: fm.id,
        field: "progress",
        currentValue: currentProgress,
        proposedValue: jiraSubtaskProgress,
        reason: `Jira ${jiraKey} subtask progress is ${jiraSubtaskProgress}%`,
      });
    }

    const tags = (fm.tags as string[]) ?? [];
    const focusTag = tags.find(t => t.startsWith("focus:"));

    const report: SprintProgressItemReport = {
      id: fm.id,
      title: fm.title,
      type: fm.type,
      marvinStatus: fm.status,
      marvinProgress: currentProgress,
      jiraKey,
      jiraStatus,
      jiraSubtaskProgress,
      proposedMarvinStatus,
      statusDrift,
      progressDrift,
      commentSignals,
      commentSummary: null,
      children: [],
      owner: (fm.owner as string) ?? null,
      focusArea: focusTag ? focusTag.slice(6) : null,
    };

    // Track parent-child relationships
    const aboutArtifact = fm.aboutArtifact as string | undefined;
    if (aboutArtifact && sprintItemIds.has(aboutArtifact)) {
      if (!childReportsByParent.has(aboutArtifact)) {
        childReportsByParent.set(aboutArtifact, []);
      }
      childReportsByParent.get(aboutArtifact)!.push(report);
    }

    itemReports.push(report);
  }

  // Attach children to parent reports
  for (const report of itemReports) {
    const children = childReportsByParent.get(report.id);
    if (children) {
      report.children = children;
    }
  }

  // Root items: those not nested under any other sprint item
  const childIds = new Set<string>();
  for (const children of childReportsByParent.values()) {
    for (const child of children) childIds.add(child.id);
  }
  const rootReports = itemReports.filter(r => !childIds.has(r.id));

  // 6. Focus area grouping
  const focusAreaMap = new Map<string, SprintProgressItemReport[]>();
  for (const report of rootReports) {
    const area = report.focusArea ?? "Uncategorized";
    if (!focusAreaMap.has(area)) focusAreaMap.set(area, []);
    focusAreaMap.get(area)!.push(report);
  }

  const focusAreas: FocusAreaRollup[] = [];
  for (const [name, items] of focusAreaMap) {
    const allFlatItems = items.flatMap(i => [i, ...i.children]);
    const doneCount = allFlatItems.filter(i => DONE_STATUSES.has(i.marvinStatus)).length;
    const blockedCount = allFlatItems.filter(i => i.marvinStatus === "blocked").length;
    const avgProgress = allFlatItems.length > 0
      ? Math.round(allFlatItems.reduce((s, i) => s + i.marvinProgress, 0) / allFlatItems.length)
      : 0;

    focusAreas.push({
      name,
      items,
      totalCount: allFlatItems.length,
      doneCount,
      blockedCount,
      avgProgress,
    });
  }

  // Sort focus areas: Uncategorized last, others alphabetically
  focusAreas.sort((a, b) => {
    if (a.name === "Uncategorized") return 1;
    if (b.name === "Uncategorized") return -1;
    return a.name.localeCompare(b.name);
  });

  // Drift and blocker items
  const driftItems = itemReports.filter(r => r.statusDrift || r.progressDrift);
  const blockers = itemReports.filter(r =>
    r.marvinStatus === "blocked" ||
    r.commentSignals.some(s => s.type === "blocker"),
  );

  // 7. LLM comment analysis (Phase 3)
  if (options.analyzeComments) {
    const itemsWithComments = itemReports.filter(r => r.commentSignals.length > 0 && r.jiraKey);
    if (itemsWithComments.length > 0) {
      try {
        const summaries = await analyzeCommentsForProgress(
          itemsWithComments,
          jiraIssues,
          itemJiraKeys,
        );
        for (const [artifactId, summary] of summaries) {
          const report = itemReports.find(r => r.id === artifactId);
          if (report) report.commentSummary = summary;
        }
      } catch (err) {
        errors.push(`Comment analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 8. Apply updates (Phase 2)
  const appliedUpdates: ProposedUpdate[] = [];
  if (options.applyUpdates && proposedUpdates.length > 0) {
    for (const update of proposedUpdates) {
      try {
        store.update(update.artifactId, {
          [update.field]: update.proposedValue,
          lastJiraSyncAt: new Date().toISOString(),
        } as any);

        // Propagate progress
        const doc = store.get(update.artifactId);
        if (doc) {
          if (doc.frontmatter.type === "task") {
            propagateProgressFromTask(store, update.artifactId);
          } else if (doc.frontmatter.type === "action") {
            propagateProgressToAction(store, update.artifactId);
          }
        }

        appliedUpdates.push(update);
      } catch (err) {
        errors.push(
          `Failed to apply update to ${update.artifactId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // 9. Build final report
  return {
    sprintId: sprintData.sprint.id,
    sprintTitle: sprintData.sprint.title,
    generatedAt: new Date().toISOString(),
    timeline: {
      startDate: sprintData.sprint.startDate ?? null,
      endDate: sprintData.sprint.endDate ?? null,
      daysRemaining: sprintData.timeline.daysRemaining,
      totalDays: sprintData.timeline.totalDays,
      percentComplete: sprintData.timeline.percentComplete,
    },
    overallProgress: sprintData.workItems.completionPct,
    itemReports: rootReports,
    focusAreas,
    driftItems,
    blockers,
    proposedUpdates: options.applyUpdates ? [] : proposedUpdates,
    appliedUpdates,
    errors,
  };
}

// --- LLM Comment Analysis (Phase 3) ---

const COMMENT_ANALYSIS_PROMPT = `You are a delivery management assistant analyzing Jira comments for progress signals.

For each item below, read the Jira comments and produce a 1-2 sentence progress summary.
Focus on: what work was done, what's pending, any blockers or decisions mentioned.

Return your response as a JSON object mapping artifact IDs to summary strings.
Example: {"T-001": "Backend API completed and deployed. Frontend integration pending review.", "A-003": "Blocked on infrastructure team approval."}

IMPORTANT: Only return the JSON object, no other text.`;

async function analyzeCommentsForProgress(
  items: SprintProgressItemReport[],
  jiraIssues: Map<string, { issue: any; comments: JiraComment[] }>,
  itemJiraKeys: Map<string, string>,
): Promise<Map<string, string>> {
  const summaries = new Map<string, string>();

  // Batch items (max 20 per LLM call)
  const MAX_ITEMS_PER_CALL = 20;
  const itemsToAnalyze = items.slice(0, MAX_ITEMS_PER_CALL);

  const promptParts: string[] = [];
  for (const item of itemsToAnalyze) {
    const jiraKey = itemJiraKeys.get(item.id);
    if (!jiraKey) continue;
    const jiraData = jiraIssues.get(jiraKey);
    if (!jiraData || jiraData.comments.length === 0) continue;

    const commentTexts = jiraData.comments
      .map(c => {
        const text = extractCommentText(c.body);
        return `  [${c.author.displayName}, ${c.created.slice(0, 10)}]: ${text.slice(0, 500)}`;
      })
      .join("\n");

    promptParts.push(`## ${item.id} — ${item.title} (${jiraKey}, Jira status: ${item.jiraStatus})\nComments:\n${commentTexts}`);
  }

  if (promptParts.length === 0) return summaries;

  const prompt = promptParts.join("\n\n");

  const result = query({
    prompt,
    options: {
      systemPrompt: COMMENT_ANALYSIS_PROMPT,
      maxTurns: 1,
      tools: [],
      allowedTools: [],
    },
  });

  for await (const msg of result) {
    if (msg.type === "assistant") {
      const textBlock = msg.message.content.find(
        (b: { type: string }): b is { type: "text"; text: string } => b.type === "text",
      );
      if (textBlock) {
        try {
          const parsed = JSON.parse(textBlock.text);
          for (const [id, summary] of Object.entries(parsed)) {
            if (typeof summary === "string") {
              summaries.set(id, summary);
            }
          }
        } catch {
          // If JSON parsing fails, try to extract from markdown code block
          const match = textBlock.text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (match) {
            try {
              const parsed = JSON.parse(match[1]);
              for (const [id, summary] of Object.entries(parsed)) {
                if (typeof summary === "string") {
                  summaries.set(id, summary);
                }
              }
            } catch { /* ignore */ }
          }
        }
      }
    }
  }

  return summaries;
}

// --- Report Formatter ---

export function formatProgressReport(report: SprintProgressReport): string {
  const parts: string[] = [];

  // Header
  parts.push(`# Sprint Progress Assessment — ${report.sprintId}`);
  parts.push(`${report.sprintTitle}`);
  parts.push(`Generated: ${report.generatedAt.slice(0, 16)}`);
  parts.push("");

  // Timeline
  if (report.timeline.startDate && report.timeline.endDate) {
    parts.push(`## Timeline`);
    parts.push(`${report.timeline.startDate} → ${report.timeline.endDate}`);
    parts.push(`Days remaining: ${report.timeline.daysRemaining} / ${report.timeline.totalDays} (${report.timeline.percentComplete}% elapsed)`);
    parts.push(`Overall progress: ${report.overallProgress}%`);
    parts.push("");
  }

  // Focus areas
  if (report.focusAreas.length > 0) {
    parts.push(`## Focus Areas`);
    parts.push("");

    for (const area of report.focusAreas) {
      const bar = progressBar(area.avgProgress);
      parts.push(`### ${area.name} ${bar} ${area.avgProgress}%`);
      parts.push(`${area.doneCount}/${area.totalCount} done${area.blockedCount > 0 ? ` | ${area.blockedCount} blocked` : ""}`);
      parts.push("");

      for (const item of area.items) {
        formatItemLine(parts, item, 0);
      }
      parts.push("");
    }
  }

  // Drift items
  if (report.driftItems.length > 0) {
    parts.push(`## Status Drift (${report.driftItems.length} items)`);
    for (const item of report.driftItems) {
      const driftParts: string[] = [];
      if (item.statusDrift) {
        driftParts.push(`status: ${item.marvinStatus} → ${item.proposedMarvinStatus}`);
      }
      if (item.progressDrift && item.jiraSubtaskProgress !== null) {
        driftParts.push(`progress: ${item.marvinProgress}% → ${item.jiraSubtaskProgress}%`);
      }
      parts.push(`  ⚠ ${item.id} (${item.jiraKey}) — ${driftParts.join(", ")}`);
    }
    parts.push("");
  }

  // Blockers
  if (report.blockers.length > 0) {
    parts.push(`## Blockers (${report.blockers.length})`);
    for (const item of report.blockers) {
      const blockerSignals = item.commentSignals.filter(s => s.type === "blocker");
      parts.push(`  🚫 ${item.id} — ${item.title}${item.jiraKey ? ` (${item.jiraKey})` : ""}`);
      for (const signal of blockerSignals) {
        parts.push(`     "${signal.snippet}"`);
      }
    }
    parts.push("");
  }

  // Proposed / Applied updates
  if (report.proposedUpdates.length > 0) {
    parts.push(`## Proposed Updates (${report.proposedUpdates.length})`);
    for (const update of report.proposedUpdates) {
      parts.push(`  ${update.artifactId}.${update.field}: ${String(update.currentValue)} → ${String(update.proposedValue)}`);
      parts.push(`    Reason: ${update.reason}`);
    }
    parts.push("");
    parts.push("Run with applyUpdates=true to apply these changes.");
    parts.push("");
  }

  if (report.appliedUpdates.length > 0) {
    parts.push(`## Applied Updates (${report.appliedUpdates.length})`);
    for (const update of report.appliedUpdates) {
      parts.push(`  ✓ ${update.artifactId}.${update.field}: ${String(update.currentValue)} → ${String(update.proposedValue)}`);
    }
    parts.push("");
  }

  // Errors
  if (report.errors.length > 0) {
    parts.push(`## Errors`);
    for (const err of report.errors) {
      parts.push(`  ${err}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

function formatItemLine(parts: string[], item: SprintProgressItemReport, depth: number): void {
  const indent = "  ".repeat(depth + 1);
  const statusIcon = DONE_STATUSES.has(item.marvinStatus) ? "✓" :
    item.marvinStatus === "blocked" ? "🚫" :
    item.marvinStatus === "in-progress" ? "▶" : "○";

  const jiraLabel = item.jiraKey ? ` [${item.jiraKey}: ${item.jiraStatus}]` : "";
  const driftFlag = item.statusDrift ? " ⚠drift" : "";
  const progressLabel = item.marvinProgress > 0 ? ` ${item.marvinProgress}%` : "";

  parts.push(`${indent}${statusIcon} ${item.id} — ${item.title} [${item.marvinStatus}]${progressLabel}${jiraLabel}${driftFlag}`);

  if (item.commentSummary) {
    parts.push(`${indent}  💬 ${item.commentSummary}`);
  }

  for (const child of item.children) {
    formatItemLine(parts, child, depth + 1);
  }
}

function progressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}
