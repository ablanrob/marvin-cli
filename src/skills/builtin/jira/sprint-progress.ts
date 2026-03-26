import { query } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";
import type { JiraClient, JiraComment } from "./client.js";
import type { LinkedIssueSummary, ResolvedStatusMap } from "./sync.js";
import {
  mapJiraStatusForAction,
  mapJiraStatusForTask,
  computeSubtaskProgress,
  extractJiraKeyFromTags,
  isInActiveSprint,
  collectLinkedIssues,
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
  getEffectiveProgress,
  STATUS_PROGRESS_DEFAULTS,
} from "../../../storage/progress.js";

// --- Types ---

export type ProgressSource = "explicit" | "comment-analysis" | "status-default";
export type WeightSource = "complexity" | "default";

export interface LinkedIssueSignal {
  sourceKey: string;
  linkType: string;
  commentSignals: CommentSignal[];
  commentSummary: string | null;
}

export interface SprintProgressItemReport {
  id: string;
  title: string;
  type: string;
  marvinStatus: string;
  marvinProgress: number;
  progress: number;
  progressSource: ProgressSource;
  weight: number;
  weightSource: WeightSource;
  jiraKey: string | null;
  jiraStatus: string | null;
  jiraSubtaskProgress: number | null;
  proposedMarvinStatus: string | null;
  statusDrift: boolean;
  progressDrift: boolean;
  commentSignals: CommentSignal[];
  commentSummary: string | null;
  linkedIssues: LinkedIssueSummary[];
  linkedIssueSignals: LinkedIssueSignal[];
  children: SprintProgressItemReport[];
  owner: string | null;
  focusArea: string | null;
}

export interface FocusAreaRollup {
  name: string;
  progress: number;
  taskCount: number;
  doneCount: number;
  blockedCount: number;
  blockedWeightPct: number;
  riskWarning: string | null;
  items: SprintProgressItemReport[];
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
const MAX_LINKED_ISSUES = 50;
const BLOCKED_WEIGHT_RISK_THRESHOLD = 0.3;

// --- Complexity → Weight mapping ---

export const COMPLEXITY_WEIGHTS: Record<string, number> = {
  trivial: 1,
  simple: 2,
  moderate: 3,
  complex: 5,
  "very-complex": 8,
};
const DEFAULT_WEIGHT = 3;

// Re-export STATUS_PROGRESS_DEFAULTS from progress.ts (single source of truth)
export { STATUS_PROGRESS_DEFAULTS };

// --- Resolution helpers ---

export function resolveWeight(complexity: string | undefined): { weight: number; weightSource: WeightSource } {
  if (complexity && complexity in COMPLEXITY_WEIGHTS) {
    return { weight: COMPLEXITY_WEIGHTS[complexity], weightSource: "complexity" };
  }
  return { weight: DEFAULT_WEIGHT, weightSource: "default" };
}

export function resolveProgress(
  frontmatter: Record<string, any>,
  commentAnalysisProgress: number | null,
): { progress: number; progressSource: ProgressSource } {
  // 1. Explicit progress field (check if truly set, not just 0-from-default)
  const hasExplicitProgress = "progress" in frontmatter && typeof frontmatter.progress === "number";
  if (hasExplicitProgress) {
    return { progress: Math.max(0, Math.min(100, Math.round(frontmatter.progress))), progressSource: "explicit" };
  }

  // 2. LLM comment analysis
  if (commentAnalysisProgress !== null) {
    return { progress: Math.max(0, Math.min(100, Math.round(commentAnalysisProgress))), progressSource: "comment-analysis" };
  }

  // 3. Status-based fallback (using shared STATUS_PROGRESS_DEFAULTS)
  const status = frontmatter.status as string;
  const defaultProgress = STATUS_PROGRESS_DEFAULTS[status] ?? 0;
  return { progress: defaultProgress, progressSource: "status-default" };
}

/**
 * Compute weighted average progress for a set of items.
 * Returns 0 if total weight is 0.
 */
export function computeWeightedProgress(items: SprintProgressItemReport[]): number {
  if (items.length === 0) return 0;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const item of items) {
    totalWeight += item.weight;
    weightedSum += item.weight * item.progress;
  }
  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}

// --- Core function ---

export interface AssessSprintProgressOptions {
  sprintId?: string;
  analyzeComments?: boolean;
  applyUpdates?: boolean;
  traverseLinks?: boolean;
  statusMap?: ResolvedStatusMap;
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

  // 4b. Recursive linked issue traversal (BFS) when traverseLinks=true
  //     Follows all non-subtask issue links until no new keys are discovered.
  //     Cycle-safe via visited set, capped at MAX_LINKED_ISSUES to bound API calls.
  const linkedJiraIssues = new Map<string, { issue: any; comments: JiraComment[] }>();

  if (options.traverseLinks) {
    const visited = new Set<string>(jiraIssues.keys());
    const queue: string[] = [];

    // Seed the BFS queue from primary issues
    for (const [, data] of jiraIssues) {
      const links = collectLinkedIssues(data.issue);
      for (const link of links) {
        if (link.relationship !== "subtask" && !visited.has(link.key)) {
          visited.add(link.key);
          queue.push(link.key);
        }
      }
    }

    // BFS: fetch, discover new links, repeat until exhausted or cap reached
    while (queue.length > 0 && linkedJiraIssues.size < MAX_LINKED_ISSUES) {
      const remaining = MAX_LINKED_ISSUES - linkedJiraIssues.size;
      const batch = queue.splice(0, Math.min(BATCH_SIZE, remaining));
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
          const { key, issue, comments } = result.value;
          linkedJiraIssues.set(key, { issue, comments });

          // Discover new links from this issue and enqueue them
          const newLinks = collectLinkedIssues(issue);
          for (const link of newLinks) {
            if (link.relationship !== "subtask" && !visited.has(link.key)) {
              visited.add(link.key);
              queue.push(link.key);
            }
          }
        } else {
          const batchKey = batch[results.indexOf(result)];
          errors.push(`Failed to fetch linked issue ${batchKey}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
        }
      }
    }

    if (queue.length > 0) {
      errors.push(`Link traversal capped at ${MAX_LINKED_ISSUES} linked issues (${queue.length} remaining undiscovered)`);
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

      // Map Jira status to Marvin status (sprint-scoped items are always "in sprint")
      const inSprint = isInActiveSprint(store, fm.tags as string[] | undefined);
      const resolved = options.statusMap ?? {};
      proposedMarvinStatus = fm.type === "task"
        ? mapJiraStatusForTask(jiraStatus!, resolved, inSprint)
        : mapJiraStatusForAction(jiraStatus!, resolved, inSprint);

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
    } else if (statusDrift && proposedMarvinStatus && !fm.progressOverride) {
      // When status changes and no Jira subtask progress available,
      // propose the status-based default progress for the new status
      const hasExplicitProgress = "progress" in fm && typeof fm.progress === "number";
      if (!hasExplicitProgress) {
        const proposedProgress = STATUS_PROGRESS_DEFAULTS[proposedMarvinStatus] ?? 0;
        if (proposedProgress !== currentProgress) {
          proposedUpdates.push({
            artifactId: fm.id,
            field: "progress",
            currentValue: currentProgress,
            proposedValue: proposedProgress,
            reason: `Status changing to "${proposedMarvinStatus}" → default progress ${proposedProgress}%`,
          });
        }
      }
    }

    const tags = (fm.tags as string[]) ?? [];
    const focusTag = tags.find(t => t.startsWith("focus:"));

    // Resolve weight from complexity
    const { weight, weightSource } = resolveWeight(fm.complexity as string | undefined);

    // Resolve progress with priority cascade (comment-analysis applied later)
    const { progress: resolvedProgress, progressSource } = resolveProgress(fm, null);

    // 5b. Linked issue enrichment when traverseLinks=true
    //     Walks the full transitive link graph (BFS) from this item's Jira issue,
    //     collecting all reachable linked issues and their comment signals.
    let itemLinkedIssues: LinkedIssueSummary[] = [];
    const itemLinkedIssueSignals: LinkedIssueSignal[] = [];

    if (options.traverseLinks && jiraData) {
      const { allLinks, allSignals } = collectTransitiveLinks(
        jiraData.issue,
        jiraIssues,
        linkedJiraIssues,
      );
      itemLinkedIssues = allLinks;
      itemLinkedIssueSignals.push(...allSignals);

      // 6. Link signal analysis for proposed updates (uses full transitive chain)
      analyzeLinkedIssueSignals(
        allLinks,
        fm,
        jiraKey!,
        proposedUpdates,
      );
    }

    const report: SprintProgressItemReport = {
      id: fm.id,
      title: fm.title,
      type: fm.type,
      marvinStatus: fm.status,
      marvinProgress: currentProgress,
      progress: resolvedProgress,
      progressSource,
      weight,
      weightSource,
      jiraKey,
      jiraStatus,
      jiraSubtaskProgress,
      proposedMarvinStatus,
      statusDrift,
      progressDrift,
      commentSignals,
      commentSummary: null,
      linkedIssues: itemLinkedIssues,
      linkedIssueSignals: itemLinkedIssueSignals,
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

  // 6a. Action-level rollup: actions with children get weighted average of child tasks
  //     unless the action has an explicit progress override
  for (const report of rootReports) {
    if (report.children.length > 0) {
      const doc = store.get(report.id);
      const hasExplicitOverride = doc?.frontmatter.progressOverride;
      if (!hasExplicitOverride) {
        report.progress = computeWeightedProgress(report.children);
        report.progressSource = "status-default"; // derived from children
      }
    }
  }

  // 6b. Focus area grouping with weighted rollup
  const focusAreaMap = new Map<string, SprintProgressItemReport[]>();
  for (const report of rootReports) {
    if (!report.focusArea) continue; // items without focus tag excluded from focus rollups
    if (!focusAreaMap.has(report.focusArea)) focusAreaMap.set(report.focusArea, []);
    focusAreaMap.get(report.focusArea)!.push(report);
  }

  const focusAreas: FocusAreaRollup[] = [];
  for (const [name, items] of focusAreaMap) {
    const allFlatItems = items.flatMap(i => [i, ...i.children]);
    const doneCount = allFlatItems.filter(i => DONE_STATUSES.has(i.marvinStatus)).length;
    const blockedCount = allFlatItems.filter(i => i.marvinStatus === "blocked").length;

    // Weighted rollup using top-level items only (no double-counting children)
    const progress = computeWeightedProgress(items);

    // Blocked weight percentage
    const totalWeight = items.reduce((s, i) => s + i.weight, 0);
    const blockedWeight = items
      .filter(i => i.marvinStatus === "blocked")
      .reduce((s, i) => s + i.weight, 0);
    const blockedWeightPct = totalWeight > 0
      ? Math.round((blockedWeight / totalWeight) * 100)
      : 0;

    const riskWarning = blockedWeightPct > BLOCKED_WEIGHT_RISK_THRESHOLD * 100
      ? `${blockedWeightPct}% of scope is blocked`
      : null;

    focusAreas.push({
      name,
      progress,
      taskCount: allFlatItems.length,
      doneCount,
      blockedCount,
      blockedWeightPct,
      riskWarning,
      items,
    });
  }

  // Sort focus areas alphabetically
  focusAreas.sort((a, b) => a.name.localeCompare(b.name));

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
          if (report) {
            report.commentSummary = summary;
            // If this item didn't have explicit progress, upgrade to comment-analysis source
            if (report.progressSource === "status-default") {
              // Try to extract a percentage from the summary
              const pctMatch = summary.match(/(\d{1,3})%/);
              if (pctMatch) {
                const pct = parseInt(pctMatch[1], 10);
                if (pct >= 0 && pct <= 100) {
                  report.progress = pct;
                  report.progressSource = "comment-analysis";
                }
              }
            }
          }
        }
      } catch (err) {
        errors.push(`Comment analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 7b. LLM comment analysis for linked issues
    if (options.traverseLinks) {
      try {
        const linkedSummaries = await analyzeLinkedIssueComments(
          itemReports,
          linkedJiraIssues,
        );
        for (const [artifactId, signalSummaries] of linkedSummaries) {
          const report = itemReports.find(r => r.id === artifactId);
          if (!report) continue;
          for (const [sourceKey, summary] of signalSummaries) {
            const signal = report.linkedIssueSignals.find(s => s.sourceKey === sourceKey);
            if (signal) {
              signal.commentSummary = summary;
            }
          }
        }
      } catch (err) {
        errors.push(`Linked issue comment analysis failed: ${err instanceof Error ? err.message : String(err)}`);
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
    overallProgress: rootReports.length > 0 ? computeWeightedProgress(rootReports) : sprintData.workItems.completionPct,
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

// --- Link Signal Analysis (FR-4) ---

// --- Transitive Link Collection ---

/**
 * BFS walk from a primary issue through all reachable non-subtask links.
 * Returns deduplicated linked issues and their comment signals.
 * Cycle-safe via visited set.
 */
function collectTransitiveLinks(
  primaryIssue: any,
  primaryIssues: Map<string, { issue: any; comments: JiraComment[] }>,
  linkedJiraIssues: Map<string, { issue: any; comments: JiraComment[] }>,
): { allLinks: LinkedIssueSummary[]; allSignals: LinkedIssueSignal[] } {
  const allLinks: LinkedIssueSummary[] = [];
  const allSignals: LinkedIssueSignal[] = [];
  const visited = new Set<string>([primaryIssue.key]);

  // Seed with direct links from primary issue
  const directLinks = collectLinkedIssues(primaryIssue)
    .filter(l => l.relationship !== "subtask");
  const queue = [...directLinks];

  // Mark direct links as visited
  for (const link of directLinks) {
    visited.add(link.key);
  }

  while (queue.length > 0) {
    const link = queue.shift()!;
    allLinks.push(link);

    // Look up fetched data for this linked issue
    const linkedData = linkedJiraIssues.get(link.key) ?? primaryIssues.get(link.key);
    if (!linkedData) continue;

    // Extract comment signals
    const linkedCommentSignals: CommentSignal[] = [];
    for (const comment of linkedData.comments) {
      const text = extractCommentText(comment.body);
      const signals = detectCommentSignals(text);
      linkedCommentSignals.push(...signals);
    }

    if (linkedCommentSignals.length > 0 || linkedData.comments.length > 0) {
      allSignals.push({
        sourceKey: link.key,
        linkType: link.relationship,
        commentSignals: linkedCommentSignals,
        commentSummary: null,
      });
    }

    // Discover further links from this issue (next hop)
    const nextLinks = collectLinkedIssues(linkedData.issue)
      .filter(l => l.relationship !== "subtask" && !visited.has(l.key));
    for (const next of nextLinks) {
      visited.add(next.key);
      queue.push(next);
    }
  }

  return { allLinks, allSignals };
}

const BLOCKER_LINK_PATTERNS = ["blocks", "is blocked by"];
const WONT_DO_STATUSES = new Set(["wont do", "won't do", "cancelled"]);

function analyzeLinkedIssueSignals(
  linkedIssues: LinkedIssueSummary[],
  frontmatter: Record<string, any>,
  jiraKey: string,
  proposedUpdates: ProposedUpdate[],
): void {
  if (linkedIssues.length === 0) return;

  // Check if all blockers are resolved → propose unblock
  const blockerLinks = linkedIssues.filter(l =>
    BLOCKER_LINK_PATTERNS.some(p => l.relationship.toLowerCase().includes(p.split(" ")[0])),
  );
  if (blockerLinks.length > 0 && blockerLinks.every(l => l.isDone) && frontmatter.status === "blocked") {
    proposedUpdates.push({
      artifactId: frontmatter.id,
      field: "status",
      currentValue: "blocked",
      proposedValue: "in-progress",
      reason: `All blocking issues resolved: ${blockerLinks.map(l => l.key).join(", ")}`,
    });
  }

  // Check for "Won't Do" / "Cancelled" linked issues → flag for review
  const wontDoLinks = linkedIssues.filter(l =>
    WONT_DO_STATUSES.has(l.status.toLowerCase()),
  );
  if (wontDoLinks.length > 0) {
    proposedUpdates.push({
      artifactId: frontmatter.id,
      field: "review",
      currentValue: null,
      proposedValue: "needs-review",
      reason: `Linked issue(s) cancelled/won't do: ${wontDoLinks.map(l => `${l.key} "${l.summary}"`).join(", ")}`,
    });
  }
}

// --- Linked Issue LLM Comment Analysis ---

const LINKED_COMMENT_ANALYSIS_PROMPT = `You are a delivery management assistant analyzing Jira comments from linked issues for progress signals.

For each linked issue below, read the comments and produce a 1-sentence summary focused on: impact on the parent issue, blockers, or decisions.

Return your response as a JSON object mapping artifact IDs to objects mapping linked issue keys to summary strings.
Example: {"T-001": {"PROJ-301": "DBA review scheduled for Thursday."}}

IMPORTANT: Only return the JSON object, no other text.`;

async function analyzeLinkedIssueComments(
  items: SprintProgressItemReport[],
  linkedJiraIssues: Map<string, { issue: any; comments: JiraComment[] }>,
): Promise<Map<string, Map<string, string>>> {
  const results = new Map<string, Map<string, string>>();

  const promptParts: string[] = [];
  const itemsWithLinkedComments: SprintProgressItemReport[] = [];

  for (const item of items) {
    if (item.linkedIssueSignals.length === 0) continue;

    const linkedParts: string[] = [];
    for (const signal of item.linkedIssueSignals) {
      const linkedData = linkedJiraIssues.get(signal.sourceKey);
      if (!linkedData || linkedData.comments.length === 0) continue;

      const commentTexts = linkedData.comments
        .map(c => {
          const text = extractCommentText(c.body);
          return `    [${c.author.displayName}, ${c.created.slice(0, 10)}]: ${text.slice(0, 300)}`;
        })
        .join("\n");

      linkedParts.push(`  ### ${signal.sourceKey} (${signal.linkType})\n${commentTexts}`);
    }

    if (linkedParts.length > 0) {
      itemsWithLinkedComments.push(item);
      promptParts.push(`## ${item.id} — ${item.title}\nLinked issues:\n${linkedParts.join("\n")}`);
    }
  }

  if (promptParts.length === 0) return results;

  const prompt = promptParts.join("\n\n");

  const llmResult = query({
    prompt,
    options: {
      systemPrompt: LINKED_COMMENT_ANALYSIS_PROMPT,
      maxTurns: 1,
      tools: [],
      allowedTools: [],
    },
  });

  for await (const msg of llmResult) {
    if (msg.type === "assistant") {
      const textBlock = msg.message.content.find(
        (b: { type: string }): b is { type: "text"; text: string } => b.type === "text",
      );
      if (textBlock) {
        const parsed = parseLlmJson(textBlock.text);
        if (parsed) {
          for (const [artifactId, linkedSummaries] of Object.entries(parsed)) {
            if (typeof linkedSummaries === "object" && linkedSummaries !== null) {
              const signalMap = new Map<string, string>();
              for (const [key, summary] of Object.entries(linkedSummaries as Record<string, unknown>)) {
                if (typeof summary === "string") {
                  signalMap.set(key, summary);
                }
              }
              if (signalMap.size > 0) {
                results.set(artifactId, signalMap);
              }
            }
          }
        }
      }
    }
  }

  return results;
}

function parseLlmJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch { /* ignore */ }
    }
    return null;
  }
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
      const bar = progressBar(area.progress);
      parts.push(`### ${area.name} ${bar} ${area.progress}%`);
      parts.push(`${area.doneCount}/${area.taskCount} done${area.blockedCount > 0 ? ` | ${area.blockedCount} blocked` : ""}`);
      if (area.riskWarning) {
        parts.push(`  ⚠ ${area.riskWarning}`);
      }
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
  const progressLabel = ` ${item.progress}%`;
  const weightLabel = `w${item.weight}`;
  const sourceLabel = item.progressSource === "explicit" ? "" :
    item.progressSource === "comment-analysis" ? " (llm)" : " (est)";

  parts.push(`${indent}${statusIcon} ${item.id} — ${item.title} [${item.marvinStatus}]${progressLabel}${sourceLabel} (${weightLabel})${jiraLabel}${driftFlag}`);

  if (item.commentSummary) {
    parts.push(`${indent}  💬 ${item.commentSummary}`);
  }

  if (item.linkedIssues.length > 0) {
    parts.push(`${indent}  🔗 Linked Issues:`);
    for (const link of item.linkedIssues) {
      const doneMarker = link.isDone ? " ✓" : "";
      const blockerResolved = link.isDone &&
        BLOCKER_LINK_PATTERNS.some(p => link.relationship.toLowerCase().includes(p.split(" ")[0]))
        ? " unblock signal" : "";
      const wontDo = WONT_DO_STATUSES.has(link.status.toLowerCase()) ? " ⚠ needs review" : "";
      parts.push(`${indent}    ${link.relationship} ${link.key} "${link.summary}" [${link.status}]${doneMarker}${blockerResolved}${wontDo}`);

      // Show linked issue comment summary if available
      const signal = item.linkedIssueSignals.find(s => s.sourceKey === link.key);
      if (signal?.commentSummary) {
        parts.push(`${indent}      💬 ${signal.commentSummary}`);
      }
    }
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

// ========================================================================
// Single-Artifact Assessment
// ========================================================================

export interface ArtifactAssessmentReport {
  artifactId: string;
  title: string;
  type: string;
  marvinStatus: string;
  marvinProgress: number;
  sprint: string | null;
  parent: string | null;
  jiraKey: string | null;
  jiraStatus: string | null;
  jiraAssignee: string | null;
  jiraSubtaskProgress: number | null;
  proposedMarvinStatus: string | null;
  statusDrift: boolean;
  progressDrift: boolean;
  commentSignals: CommentSignal[];
  commentSummary: string | null;
  linkedIssues: LinkedIssueSummary[];
  linkedIssueSignals: LinkedIssueSignal[];
  children: ArtifactAssessmentReport[];
  proposedUpdates: ProposedUpdate[];
  appliedUpdates: ProposedUpdate[];
  signals: string[];
  errors: string[];
}

export interface AssessArtifactOptions {
  artifactId: string;
  applyUpdates?: boolean;
  statusMap?: ResolvedStatusMap;
}

const MAX_ARTIFACT_NODES = 50;
const MAX_LLM_DEPTH = 3;            // LLM analysis for depth 0, 1, 2
const MAX_LLM_COMMENT_CHARS = 8000; // skip LLM if collected comment text exceeds this

export async function assessArtifact(
  store: DocumentStore,
  client: JiraClient,
  host: string,
  options: AssessArtifactOptions,
): Promise<ArtifactAssessmentReport> {
  const visited = new Set<string>();
  return _assessArtifactRecursive(store, client, host, options, visited, 0);
}

/**
 * Internal recursive assessment. Each node in the artifact tree gets a full
 * Jira assessment (status, drift, links, signals). LLM comment analysis
 * runs for nodes within MAX_LLM_DEPTH, gated by a token budget check.
 * Cycle-safe via visited set, capped at MAX_ARTIFACT_NODES total nodes.
 */
async function _assessArtifactRecursive(
  store: DocumentStore,
  client: JiraClient,
  host: string,
  options: AssessArtifactOptions,
  visited: Set<string>,
  depth: number,
): Promise<ArtifactAssessmentReport> {
  const errors: string[] = [];

  // Cycle detection
  if (visited.has(options.artifactId)) {
    return emptyArtifactReport(options.artifactId, [`Cycle detected: ${options.artifactId} already visited`]);
  }

  // Cap check
  if (visited.size >= MAX_ARTIFACT_NODES) {
    return emptyArtifactReport(options.artifactId, [`Node cap reached (${MAX_ARTIFACT_NODES}), skipping ${options.artifactId}`]);
  }

  visited.add(options.artifactId);

  // 1. Load the artifact
  const doc = store.get(options.artifactId);
  if (!doc) {
    return emptyArtifactReport(options.artifactId, [`Artifact ${options.artifactId} not found`]);
  }

  const fm = doc.frontmatter;
  const jiraKey = (fm.jiraKey as string | undefined)
    ?? extractJiraKeyFromTags(fm.tags as string[] | undefined)
    ?? null;

  const tags = (fm.tags as string[]) ?? [];
  const sprintTag = tags.find(t => t.startsWith("sprint:"));
  const sprint = sprintTag ? sprintTag.slice(7) : null;
  const parent = (fm.aboutArtifact as string | undefined) ?? null;

  // 2. Fetch Jira data for primary artifact
  let jiraStatus: string | null = null;
  let jiraAssignee: string | null = null;
  let proposedMarvinStatus: string | null = null;
  let jiraSubtaskProgress: number | null = null;
  const commentSignals: CommentSignal[] = [];
  let commentSummary: string | null = null;
  let linkedIssues: LinkedIssueSummary[] = [];
  let linkedIssueSignals: LinkedIssueSignal[] = [];
  const proposedUpdates: ProposedUpdate[] = [];

  const jiraIssues = new Map<string, { issue: any; comments: JiraComment[] }>();
  const linkedJiraIssues = new Map<string, { issue: any; comments: JiraComment[] }>();

  if (jiraKey) {
    try {
      const [issue, comments] = await Promise.all([
        client.getIssueWithLinks(jiraKey),
        client.getComments(jiraKey),
      ]);
      jiraIssues.set(jiraKey, { issue, comments });
      jiraStatus = issue.fields.status.name;
      jiraAssignee = issue.fields.assignee?.displayName ?? null;

      // Status mapping
      const inSprint = isInActiveSprint(store, fm.tags as string[] | undefined);
      const resolved = options.statusMap ?? {};
      proposedMarvinStatus = fm.type === "task"
        ? mapJiraStatusForTask(jiraStatus!, resolved, inSprint)
        : mapJiraStatusForAction(jiraStatus!, resolved, inSprint);

      // Subtask progress
      const subtasks = issue.fields.subtasks ?? [];
      if (subtasks.length > 0) {
        jiraSubtaskProgress = computeSubtaskProgress(subtasks);
      }

      // Comment signals
      for (const comment of comments) {
        const text = extractCommentText(comment.body);
        const signals = detectCommentSignals(text);
        commentSignals.push(...signals);
      }

      // Recursive link traversal (always on for single artifact)
      const jiraVisited = new Set<string>([jiraKey]);
      const queue: string[] = [];

      const directLinks = collectLinkedIssues(issue)
        .filter(l => l.relationship !== "subtask");
      for (const link of directLinks) {
        if (!jiraVisited.has(link.key)) {
          jiraVisited.add(link.key);
          queue.push(link.key);
        }
      }

      while (queue.length > 0 && linkedJiraIssues.size < MAX_LINKED_ISSUES) {
        const remaining = MAX_LINKED_ISSUES - linkedJiraIssues.size;
        const batch = queue.splice(0, Math.min(BATCH_SIZE, remaining));
        const results = await Promise.allSettled(
          batch.map(async (key) => {
            const [li, lc] = await Promise.all([
              client.getIssueWithLinks(key),
              client.getComments(key),
            ]);
            return { key, issue: li, comments: lc };
          }),
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            const { key, issue: li, comments: lc } = result.value;
            linkedJiraIssues.set(key, { issue: li, comments: lc });

            const newLinks = collectLinkedIssues(li)
              .filter(l => l.relationship !== "subtask" && !jiraVisited.has(l.key));
            for (const nl of newLinks) {
              jiraVisited.add(nl.key);
              queue.push(nl.key);
            }
          } else {
            const batchKey = batch[results.indexOf(result)];
            errors.push(`Failed to fetch linked issue ${batchKey}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
          }
        }
      }

      // Collect transitive links and signals
      const { allLinks, allSignals } = collectTransitiveLinks(
        issue, jiraIssues, linkedJiraIssues,
      );
      linkedIssues = allLinks;
      linkedIssueSignals = allSignals;

      // Analyze link signals for proposed updates
      analyzeLinkedIssueSignals(allLinks, fm, jiraKey, proposedUpdates);

    } catch (err) {
      errors.push(`Failed to fetch ${jiraKey}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Drift detection
  const currentProgress = getEffectiveProgress(fm);
  const statusDrift = proposedMarvinStatus !== null && proposedMarvinStatus !== fm.status;
  const progressDrift = jiraSubtaskProgress !== null &&
    !fm.progressOverride &&
    jiraSubtaskProgress !== currentProgress;

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
  } else if (statusDrift && proposedMarvinStatus && !fm.progressOverride) {
    const hasExplicitProgress = "progress" in fm && typeof fm.progress === "number";
    if (!hasExplicitProgress) {
      const proposedProgress = STATUS_PROGRESS_DEFAULTS[proposedMarvinStatus] ?? 0;
      if (proposedProgress !== currentProgress) {
        proposedUpdates.push({
          artifactId: fm.id,
          field: "progress",
          currentValue: currentProgress,
          proposedValue: proposedProgress,
          reason: `Status changing to "${proposedMarvinStatus}" → default progress ${proposedProgress}%`,
        });
      }
    }
  }

  // 4. LLM comment analysis (depth < MAX_LLM_DEPTH, gated by token budget)
  //    Only runs when the primary issue has comments (avoids hallucination from
  //    linked-only data). Linked issue comments enrich the analysis when present.
  const primaryHasComments = jiraKey ? (jiraIssues.get(jiraKey)?.comments.length ?? 0) > 0 : false;
  if (depth < MAX_LLM_DEPTH && jiraKey && primaryHasComments) {
    const estimatedChars = estimateCommentTextSize(jiraIssues, linkedJiraIssues, linkedIssueSignals);
    if (estimatedChars <= MAX_LLM_COMMENT_CHARS) {
      try {
        const summary = await analyzeSingleArtifactComments(
          fm.id, fm.title, jiraKey, jiraStatus,
          jiraIssues, linkedJiraIssues, linkedIssueSignals,
        );
        commentSummary = summary;
      } catch (err) {
        errors.push(`Comment analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 5. Recursive child assessment (actions → tasks; epics → actions/tasks)
  const childIds = findChildIds(store, fm);
  const children: ArtifactAssessmentReport[] = [];
  for (const childId of childIds) {
    if (visited.size >= MAX_ARTIFACT_NODES) {
      errors.push(`Node cap reached (${MAX_ARTIFACT_NODES}), ${childIds.length - children.length} children skipped`);
      break;
    }
    const childReport = await _assessArtifactRecursive(
      store, client, host,
      { ...options, artifactId: childId },
      visited,
      depth + 1,
    );
    children.push(childReport);
  }

  // 6. Build contextual signals summary
  const signals = buildSignals(commentSignals, linkedIssues, statusDrift, proposedMarvinStatus);

  // 7. Apply updates
  const appliedUpdates: ProposedUpdate[] = [];
  if (options.applyUpdates && proposedUpdates.length > 0) {
    for (const update of proposedUpdates) {
      if (update.field === "review") continue; // review flags are informational only
      try {
        store.update(update.artifactId, {
          [update.field]: update.proposedValue,
          lastJiraSyncAt: new Date().toISOString(),
        } as any);

        const updatedDoc = store.get(update.artifactId);
        if (updatedDoc) {
          if (updatedDoc.frontmatter.type === "task") {
            propagateProgressFromTask(store, update.artifactId);
          } else if (updatedDoc.frontmatter.type === "action") {
            propagateProgressToAction(store, update.artifactId);
          }
        }
        appliedUpdates.push(update);
      } catch (err) {
        errors.push(`Failed to apply update: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return {
    artifactId: fm.id,
    title: fm.title,
    type: fm.type,
    marvinStatus: fm.status,
    marvinProgress: currentProgress,
    sprint,
    parent,
    jiraKey,
    jiraStatus,
    jiraAssignee,
    jiraSubtaskProgress,
    proposedMarvinStatus,
    statusDrift,
    progressDrift,
    commentSignals,
    commentSummary,
    linkedIssues,
    linkedIssueSignals,
    children,
    proposedUpdates: options.applyUpdates ? [] : proposedUpdates,
    appliedUpdates,
    signals,
    errors,
  };
}

// --- Child ID discovery ---

function findChildIds(store: DocumentStore, fm: Record<string, any>): string[] {
  if (fm.type === "action") {
    return store.list({ type: "task" })
      .filter(d => d.frontmatter.aboutArtifact === fm.id)
      .map(d => d.frontmatter.id);
  }

  if (fm.type === "epic") {
    const epicTag = `epic:${fm.id}`;
    const isLinked = (d: { frontmatter: Record<string, any> }) => {
      const le = d.frontmatter.linkedEpic as string[] | undefined;
      if (le?.includes(fm.id)) return true;
      const t = (d.frontmatter.tags as string[]) ?? [];
      return t.includes(epicTag);
    };
    return [
      ...store.list({ type: "action" }).filter(isLinked),
      ...store.list({ type: "task" }).filter(isLinked),
    ].map(d => d.frontmatter.id);
  }

  return [];
}

// --- Contextual signals builder (FR-4) ---

function buildSignals(
  commentSignals: CommentSignal[],
  linkedIssues: LinkedIssueSummary[],
  statusDrift: boolean,
  proposedStatus: string | null,
): string[] {
  const signals: string[] = [];

  // Blocker signals from comments
  const blockerSignals = commentSignals.filter(s => s.type === "blocker");
  if (blockerSignals.length > 0) {
    for (const s of blockerSignals) {
      signals.push(`🚫 Blocker — "${s.snippet}"`);
    }
  }

  // Check blocking links
  const blockingLinks = linkedIssues.filter(l =>
    l.relationship.toLowerCase().includes("block"),
  );
  const activeBlockers = blockingLinks.filter(l => !l.isDone);
  const resolvedBlockers = blockingLinks.filter(l => l.isDone);

  if (activeBlockers.length > 0) {
    for (const b of activeBlockers) {
      signals.push(`🚫 Blocker — ${b.relationship} ${b.key} "${b.summary}" [${b.status}]`);
    }
  }
  if (resolvedBlockers.length > 0 && activeBlockers.length === 0) {
    signals.push(`✅ Unblocked — all blocking issues resolved: ${resolvedBlockers.map(l => l.key).join(", ")}`);
  }

  // Won't Do / Cancelled links → superseded signal
  const wontDoLinks = linkedIssues.filter(l => WONT_DO_STATUSES.has(l.status.toLowerCase()));
  for (const l of wontDoLinks) {
    signals.push(`🔄 Superseded — ${l.key} "${l.summary}" is ${l.status}`);
  }

  // Question signals from comments (may indicate waiting for input)
  const questionSignals = commentSignals.filter(s => s.type === "question");
  for (const s of questionSignals) {
    signals.push(`⏳ Waiting — "${s.snippet}"`);
  }

  // Handoff: related links that are in progress (work moved elsewhere)
  const relatedInProgress = linkedIssues.filter(l =>
    l.relationship.toLowerCase().includes("relate") && !l.isDone,
  );
  if (relatedInProgress.length > 0) {
    for (const l of relatedInProgress) {
      signals.push(`📋 Handoff — related work on ${l.key} "${l.summary}" [${l.status}]`);
    }
  }

  // If no signals detected at all
  if (signals.length === 0) {
    if (statusDrift && proposedStatus) {
      signals.push(`⚠ Drift detected — Marvin and Jira statuses diverge`);
    } else {
      signals.push(`✅ No active blockers or concerns detected`);
    }
  }

  return signals;
}

// --- Single-artifact LLM comment analysis ---

/**
 * Estimate total comment text size (chars) for a node's primary + linked issues.
 * Used to decide whether to send to LLM or skip.
 */
function estimateCommentTextSize(
  jiraIssues: Map<string, { issue: any; comments: JiraComment[] }>,
  linkedJiraIssues: Map<string, { issue: any; comments: JiraComment[] }>,
  linkedIssueSignals: LinkedIssueSignal[],
): number {
  let total = 0;

  for (const [, data] of jiraIssues) {
    for (const c of data.comments) {
      total += typeof c.body === "string" ? c.body.length : JSON.stringify(c.body).length;
    }
  }

  for (const signal of linkedIssueSignals) {
    const linkedData = linkedJiraIssues.get(signal.sourceKey);
    if (!linkedData) continue;
    for (const c of linkedData.comments) {
      total += typeof c.body === "string" ? c.body.length : JSON.stringify(c.body).length;
    }
  }

  return total;
}

const SINGLE_ARTIFACT_COMMENT_PROMPT = `You are a delivery management assistant analyzing Jira comments for a single work item.

Produce a 2-3 sentence progress summary covering:
- What work has been completed
- What is pending or blocked
- Any decisions, handoffs, or scheduling mentioned
- Relevant context from linked issue comments (if provided)

Return ONLY the summary text, no JSON or formatting.`;

async function analyzeSingleArtifactComments(
  artifactId: string,
  title: string,
  jiraKey: string,
  jiraStatus: string | null,
  jiraIssues: Map<string, { issue: any; comments: JiraComment[] }>,
  linkedJiraIssues: Map<string, { issue: any; comments: JiraComment[] }>,
  linkedIssueSignals: LinkedIssueSignal[],
): Promise<string | null> {
  const promptParts: string[] = [];

  // Primary issue comments
  const primaryData = jiraIssues.get(jiraKey);
  if (primaryData && primaryData.comments.length > 0) {
    const commentTexts = primaryData.comments
      .map(c => {
        const text = extractCommentText(c.body);
        return `[${c.author.displayName}, ${c.created.slice(0, 10)}]: ${text.slice(0, 500)}`;
      })
      .join("\n");
    promptParts.push(`## ${artifactId} — ${title} (${jiraKey}, status: ${jiraStatus})\nComments:\n${commentTexts}`);
  }

  // Linked issue comments
  for (const signal of linkedIssueSignals) {
    const linkedData = linkedJiraIssues.get(signal.sourceKey);
    if (!linkedData || linkedData.comments.length === 0) continue;

    const commentTexts = linkedData.comments
      .map(c => {
        const text = extractCommentText(c.body);
        return `  [${c.author.displayName}, ${c.created.slice(0, 10)}]: ${text.slice(0, 300)}`;
      })
      .join("\n");
    promptParts.push(`### Linked: ${signal.sourceKey} (${signal.linkType})\n${commentTexts}`);
  }

  if (promptParts.length === 0) return null;

  const prompt = promptParts.join("\n\n");

  const result = query({
    prompt,
    options: {
      systemPrompt: SINGLE_ARTIFACT_COMMENT_PROMPT,
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
        return textBlock.text.trim();
      }
    }
  }

  return null;
}

// --- Empty report helper ---

function emptyArtifactReport(artifactId: string, errors: string[]): ArtifactAssessmentReport {
  return {
    artifactId,
    title: "Not found",
    type: "unknown",
    marvinStatus: "unknown",
    marvinProgress: 0,
    sprint: null,
    parent: null,
    jiraKey: null,
    jiraStatus: null,
    jiraAssignee: null,
    jiraSubtaskProgress: null,
    proposedMarvinStatus: null,
    statusDrift: false,
    progressDrift: false,
    commentSignals: [],
    commentSummary: null,
    linkedIssues: [],
    linkedIssueSignals: [],
    children: [],
    proposedUpdates: [],
    appliedUpdates: [],
    signals: [],
    errors,
  };
}

// --- Artifact report formatter ---

export function formatArtifactReport(report: ArtifactAssessmentReport): string {
  const parts: string[] = [];

  // Header
  parts.push(`# Artifact Assessment — ${report.artifactId}`);
  parts.push(report.title);
  parts.push("");

  // Marvin state
  parts.push(`## Marvin State`);
  const marvinParts = [`Status: ${report.marvinStatus}`, `Progress: ${report.marvinProgress}%`];
  if (report.sprint) marvinParts.push(`Sprint: ${report.sprint}`);
  if (report.parent) marvinParts.push(`Parent: ${report.parent}`);
  parts.push(marvinParts.join(" | "));
  parts.push("");

  // Jira state
  if (report.jiraKey) {
    parts.push(`## Jira State (${report.jiraKey})`);
    const jiraParts = [`Status: ${report.jiraStatus ?? "unknown"}`];
    if (report.jiraAssignee) jiraParts.push(`Assignee: ${report.jiraAssignee}`);
    if (report.jiraSubtaskProgress !== null) jiraParts.push(`Subtask progress: ${report.jiraSubtaskProgress}%`);
    parts.push(jiraParts.join(" | "));

    if (report.statusDrift) {
      parts.push(`⚠ Drift: ${report.marvinStatus} → ${report.proposedMarvinStatus}`);
    }
    if (report.progressDrift && report.jiraSubtaskProgress !== null) {
      parts.push(`⚠ Progress drift: ${report.marvinProgress}% → ${report.jiraSubtaskProgress}%`);
    }
    parts.push("");
  }

  // Comment summary
  if (report.commentSummary) {
    parts.push(`## Comments`);
    parts.push(report.commentSummary);
    parts.push("");
  }

  // Children
  if (report.children.length > 0) {
    const doneCount = report.children.filter(c => DONE_STATUSES.has(c.marvinStatus)).length;
    const childWeights = report.children.map(c => {
      const { weight } = resolveWeight(undefined); // children have their own assessment
      return { weight, progress: c.marvinProgress };
    });
    const childProgress = childWeights.length > 0
      ? Math.round(childWeights.reduce((s, c) => s + c.weight * c.progress, 0) / childWeights.reduce((s, c) => s + c.weight, 0))
      : 0;
    const bar = progressBar(childProgress);

    parts.push(`## Children (${doneCount}/${report.children.length} done) ${bar} ${childProgress}%`);
    for (const child of report.children) {
      formatArtifactChild(parts, child, 1);
    }
    parts.push("");
  }

  // Linked issues
  if (report.linkedIssues.length > 0) {
    parts.push(`## Linked Issues (${report.linkedIssues.length})`);
    for (const link of report.linkedIssues) {
      const doneMarker = link.isDone ? " ✓" : "";
      parts.push(`  ${link.relationship} ${link.key} "${link.summary}" [${link.status}]${doneMarker}`);
      const signal = report.linkedIssueSignals.find(s => s.sourceKey === link.key);
      if (signal?.commentSummary) {
        parts.push(`    💬 ${signal.commentSummary}`);
      }
    }
    parts.push("");
  }

  // Signals
  if (report.signals.length > 0) {
    parts.push(`## Signals`);
    for (const s of report.signals) {
      parts.push(`  ${s}`);
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

function formatArtifactChild(parts: string[], child: ArtifactAssessmentReport, depth: number): void {
  const indent = "  ".repeat(depth);
  const icon = DONE_STATUSES.has(child.marvinStatus) ? "✓" :
    child.marvinStatus === "blocked" ? "🚫" :
    child.marvinStatus === "in-progress" ? "▶" : "○";
  const jiraLabel = child.jiraKey
    ? ` [${child.jiraKey}: ${child.jiraStatus ?? "?"}]`
    : "";
  const driftLabel = child.statusDrift
    ? ` ⚠drift → ${child.proposedMarvinStatus}`
    : "";
  const signalHints: string[] = [];
  for (const s of child.signals) {
    if (s.startsWith("✅ No active")) continue; // skip the "all clear" default
    signalHints.push(s);
  }

  parts.push(`${indent}${icon} ${child.artifactId} — ${child.title} [${child.marvinStatus}] ${child.marvinProgress}%${jiraLabel}${driftLabel}`);

  if (child.commentSummary) {
    parts.push(`${indent}  💬 ${child.commentSummary}`);
  }

  for (const hint of signalHints) {
    parts.push(`${indent}  ${hint}`);
  }

  // Recurse into grandchildren
  for (const grandchild of child.children) {
    formatArtifactChild(parts, grandchild, depth + 1);
  }
}
