import type { DocumentStore } from "../../../storage/store.js";
import type {
  JiraClient,
  JiraChangelogEntry,
  JiraComment,
  JiraRemoteLink,
} from "./client.js";
import type { LinkedIssueSummary } from "./sync.js";
import { mapJiraStatusForAction, mapJiraStatusForTask } from "./sync.js";
import type { JiraStatusMap } from "../../../core/config.js";

// --- Data structures ---

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export interface IssueChange {
  field: string;
  from: string | null;
  to: string | null;
  author: string;
  timestamp: string;
}

export interface IssueCommentEntry {
  author: string;
  created: string;
  bodyPreview: string;
  signals: CommentSignal[];
}

export interface CommentSignal {
  type: "blocker" | "decision" | "question" | "resolution";
  snippet: string;
}

export interface ConfluenceLink {
  url: string;
  title: string;
}

export interface MarvinArtifactMatch {
  id: string;
  type: string;
  title: string;
  currentStatus: string;
  proposedStatus: string | null;
  statusDrift: boolean;
}

export interface LinkSuggestion {
  artifactId: string;
  artifactType: string;
  artifactTitle: string;
  score: number;
  sharedTerms: string[];
}

export interface DailyIssueEntry {
  key: string;
  summary: string;
  currentStatus: string;
  issueType: string;
  assignee: string | null;
  changes: IssueChange[];
  comments: IssueCommentEntry[];
  linkedIssues: LinkedIssueSummary[];
  confluenceLinks: ConfluenceLink[];
  marvinArtifacts: MarvinArtifactMatch[];
  linkSuggestions: LinkSuggestion[];
}

export interface ProposedAction {
  type:
    | "status-update"
    | "unlinked-issue"
    | "link-suggestion"
    | "question-candidate"
    | "decision-candidate"
    | "blocker-detected"
    | "resolution-detected"
    | "confluence-review";
  description: string;
  artifactId?: string;
  jiraKey?: string;
}

export interface DailySummary {
  dateRange: DateRange;
  generatedAt: string;
  projectKey: string;
  issues: DailyIssueEntry[];
  proposedActions: ProposedAction[];
  errors: string[];
}

// --- Comment signal detection ---

const BLOCKER_PATTERNS = [
  /\bblocked\b/i,
  /\bblocking\b/i,
  /\bwaiting\s+for\b/i,
  /\bon\s+hold\b/i,
  /\bcan'?t\s+proceed\b/i,
  /\bdepends?\s+on\b/i,
  /\bstuck\b/i,
  /\bneed[s]?\s+(to\s+wait|approval|input|clarification)\b/i,
];

const DECISION_PATTERNS = [
  /\bdecided\b/i,
  /\bagreed\b/i,
  /\bapproved?\b/i,
  /\blet'?s?\s+go\s+with\b/i,
  /\bwe('ll|\s+will)\s+(use|go|proceed|adopt)\b/i,
  /\bsigned\s+off\b/i,
  /\bconfirmed\b/i,
];

const QUESTION_PATTERNS = [
  /\?/,
  /\bdoes\s+anyone\s+know\b/i,
  /\bhow\s+should\s+we\b/i,
  /\bneed\s+clarification\b/i,
  /\bwhat('s|\s+is)\s+the\s+(plan|approach|status)\b/i,
  /\bshould\s+we\b/i,
  /\bany\s+(idea|thought|suggestion)s?\b/i,
  /\bopen\s+question\b/i,
];

const RESOLUTION_PATTERNS = [
  /\bfixed\b/i,
  /\bresolved\b/i,
  /\bmerged\b/i,
  /\bdeployed\b/i,
  /\bcompleted?\b/i,
  /\bshipped\b/i,
  /\bimplemented\b/i,
  /\bclosed\b/i,
];

export function detectCommentSignals(text: string): CommentSignal[] {
  const signals: CommentSignal[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const pattern of BLOCKER_PATTERNS) {
      if (pattern.test(trimmed)) {
        signals.push({ type: "blocker", snippet: truncate(trimmed, 120) });
        break;
      }
    }
    for (const pattern of DECISION_PATTERNS) {
      if (pattern.test(trimmed)) {
        signals.push({ type: "decision", snippet: truncate(trimmed, 120) });
        break;
      }
    }
    for (const pattern of QUESTION_PATTERNS) {
      if (pattern.test(trimmed)) {
        signals.push({ type: "question", snippet: truncate(trimmed, 120) });
        break;
      }
    }
    for (const pattern of RESOLUTION_PATTERNS) {
      if (pattern.test(trimmed)) {
        signals.push({ type: "resolution", snippet: truncate(trimmed, 120) });
        break;
      }
    }
  }

  // Deduplicate by type — keep first occurrence of each
  const seen = new Set<string>();
  return signals.filter((s) => {
    if (seen.has(s.type)) return false;
    seen.add(s.type);
    return true;
  });
}

// --- Title similarity matching ---

/** Stopwords to exclude from matching */
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "this", "that", "it", "its", "as", "not", "no", "if", "do", "does",
  "new", "via", "use", "using", "based", "into", "e.g", "etc",
]);

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

export function computeTitleSimilarity(
  jiraSummary: string,
  artifactTitle: string,
): { score: number; sharedTerms: string[] } {
  const jiraTokens = tokenize(jiraSummary);
  const artifactTokens = tokenize(artifactTitle);

  if (jiraTokens.size === 0 || artifactTokens.size === 0) {
    return { score: 0, sharedTerms: [] };
  }

  const shared: string[] = [];
  for (const token of jiraTokens) {
    if (artifactTokens.has(token)) {
      shared.push(token);
    }
  }

  // Jaccard-style: shared / union
  const union = new Set([...jiraTokens, ...artifactTokens]);
  const score = shared.length / union.size;

  return { score, sharedTerms: shared };
}

const LINK_SUGGESTION_THRESHOLD = 0.15; // At least ~15% term overlap
const MAX_LINK_SUGGESTIONS = 3;

export function findLinkSuggestions(
  jiraSummary: string,
  allDocs: { frontmatter: Record<string, any> }[],
): LinkSuggestion[] {
  const suggestions: LinkSuggestion[] = [];

  for (const doc of allDocs) {
    const fm = doc.frontmatter;
    // Skip docs that already have a jiraKey
    if (fm.jiraKey) continue;

    const { score, sharedTerms } = computeTitleSimilarity(
      jiraSummary,
      fm.title as string,
    );

    if (score >= LINK_SUGGESTION_THRESHOLD && sharedTerms.length >= 2) {
      suggestions.push({
        artifactId: fm.id as string,
        artifactType: fm.type as string,
        artifactTitle: fm.title as string,
        score,
        sharedTerms,
      });
    }
  }

  // Sort by score descending, take top N
  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LINK_SUGGESTIONS);
}

// --- Helpers ---

/**
 * Extract plain text from Jira comment body.
 * Handles both v2 (string) and v3 (ADF) formats.
 */
export function extractCommentText(body: unknown): string {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";

  // ADF format: recursive walk for text nodes
  const parts: string[] = [];
  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "text" && typeof n.text === "string") {
      parts.push(n.text);
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
    }
  }
  walk(body);
  return parts.join(" ");
}

function truncate(text: string, maxLen: number = 200): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

function isWithinRange(timestamp: string, range: DateRange): boolean {
  const date = timestamp.slice(0, 10);
  return date >= range.from && date <= range.to;
}

function isConfluenceUrl(url: string): boolean {
  return /atlassian\.net\/wiki\//i.test(url) || /\/confluence\//i.test(url);
}

const DONE_STATUSES = new Set(["done", "closed", "resolved", "obsolete", "wont do"]);

// --- Core function ---

export async function fetchJiraDaily(
  store: DocumentStore,
  client: JiraClient,
  host: string,
  projectKey: string,
  dateRange: DateRange,
  statusMap?: { action?: JiraStatusMap; task?: JiraStatusMap },
): Promise<DailySummary> {
  const summary: DailySummary = {
    dateRange,
    generatedAt: new Date().toISOString(),
    projectKey,
    issues: [],
    proposedActions: [],
    errors: [],
  };

  // 1. Search for issues updated in range
  const jql = `project = ${projectKey} AND updated >= "${dateRange.from}" AND updated <= "${dateRange.to} 23:59" ORDER BY updated DESC`;

  let searchResult;
  try {
    searchResult = await client.searchIssuesV3(
      jql,
      ["summary", "status", "issuetype", "priority", "assignee", "labels"],
      100,
    );
  } catch (err) {
    summary.errors.push(
      `Search failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return summary;
  }

  // 2. Build artifact collections for cross-referencing and link suggestions
  const allDocs = [
    ...store.list({ type: "action" }),
    ...store.list({ type: "task" }),
    ...store.list({ type: "decision" }),
    ...store.list({ type: "question" }),
  ];
  const otherTypes = store.registeredTypes.filter(
    (t) => !["action", "task", "decision", "question"].includes(t),
  );
  for (const t of otherTypes) {
    allDocs.push(...store.list({ type: t }));
  }

  const jiraKeyToArtifacts = new Map<string, typeof allDocs>();
  for (const doc of allDocs) {
    const jk = doc.frontmatter.jiraKey as string | undefined;
    if (jk) {
      const list = jiraKeyToArtifacts.get(jk) ?? [];
      list.push(doc);
      jiraKeyToArtifacts.set(jk, list);
    }
  }

  // 3. Process each issue (concurrency-limited)
  const BATCH_SIZE = 5;
  const issues = searchResult.issues;

  for (let i = 0; i < issues.length; i += BATCH_SIZE) {
    const batch = issues.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((issue) =>
        processIssue(issue, client, host, dateRange, jiraKeyToArtifacts, allDocs, statusMap),
      ),
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        summary.issues.push(r.value);
      } else {
        summary.errors.push(
          `${batch[j].key}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        );
      }
    }
  }

  // 4. Generate proposed actions
  summary.proposedActions = generateProposedActions(summary.issues);

  return summary;
}

async function processIssue(
  issue: { key: string; fields: Record<string, any> },
  client: JiraClient,
  host: string,
  dateRange: DateRange,
  jiraKeyToArtifacts: Map<string, { frontmatter: Record<string, any> }[]>,
  allDocs: { frontmatter: Record<string, any> }[],
  statusMap?: { action?: JiraStatusMap; task?: JiraStatusMap },
): Promise<DailyIssueEntry> {
  // Fetch changelog, comments, remote links, and issue links in parallel
  const [changelogResult, commentsResult, remoteLinksResult, issueWithLinks] =
    await Promise.all([
      client.getChangelog(issue.key).catch(() => [] as JiraChangelogEntry[]),
      client.getComments(issue.key).catch(() => [] as JiraComment[]),
      client.getRemoteLinks(issue.key).catch(() => [] as JiraRemoteLink[]),
      client.getIssueWithLinks(issue.key).catch(() => null),
    ]);

  // Filter changelog entries to date range
  const changes: IssueChange[] = [];
  for (const entry of changelogResult) {
    if (!isWithinRange(entry.created, dateRange)) continue;
    for (const item of entry.items) {
      changes.push({
        field: item.field,
        from: item.fromString,
        to: item.toString,
        author: entry.author.displayName,
        timestamp: entry.created,
      });
    }
  }

  // Filter comments to date range and analyze content
  const comments: IssueCommentEntry[] = [];
  for (const comment of commentsResult) {
    if (!isWithinRange(comment.created, dateRange) && !isWithinRange(comment.updated, dateRange)) {
      continue;
    }
    const fullText = extractCommentText(comment.body);
    const signals = detectCommentSignals(fullText);
    comments.push({
      author: comment.author.displayName,
      created: comment.created,
      bodyPreview: truncate(fullText),
      signals,
    });
  }

  // Extract Confluence links from remote links
  const confluenceLinks: ConfluenceLink[] = [];
  for (const rl of remoteLinksResult) {
    if (isConfluenceUrl(rl.object.url)) {
      confluenceLinks.push({
        url: rl.object.url,
        title: rl.object.title,
      });
    }
  }

  // Collect linked issues
  const linkedIssues: LinkedIssueSummary[] = [];
  if (issueWithLinks) {
    if (issueWithLinks.fields.subtasks) {
      for (const sub of issueWithLinks.fields.subtasks) {
        linkedIssues.push({
          key: sub.key,
          summary: sub.fields.summary,
          status: sub.fields.status.name,
          relationship: "subtask",
          isDone: DONE_STATUSES.has(sub.fields.status.name.toLowerCase()),
        });
      }
    }
    if (issueWithLinks.fields.issuelinks) {
      for (const link of issueWithLinks.fields.issuelinks) {
        if (link.outwardIssue) {
          linkedIssues.push({
            key: link.outwardIssue.key,
            summary: link.outwardIssue.fields.summary,
            status: link.outwardIssue.fields.status.name,
            relationship: link.type.outward,
            isDone: DONE_STATUSES.has(link.outwardIssue.fields.status.name.toLowerCase()),
          });
        }
        if (link.inwardIssue) {
          linkedIssues.push({
            key: link.inwardIssue.key,
            summary: link.inwardIssue.fields.summary,
            status: link.inwardIssue.fields.status.name,
            relationship: link.type.inward,
            isDone: DONE_STATUSES.has(link.inwardIssue.fields.status.name.toLowerCase()),
          });
        }
      }
    }
  }

  // Cross-reference with Marvin artifacts (by jiraKey)
  const marvinArtifacts: MarvinArtifactMatch[] = [];
  const artifacts = jiraKeyToArtifacts.get(issue.key) ?? [];
  for (const doc of artifacts) {
    const fm = doc.frontmatter;
    const artifactType = fm.type as string;
    let proposedStatus: string | null = null;

    if (artifactType === "action" || artifactType === "task") {
      const jiraStatus = issue.fields.status?.name;
      if (jiraStatus) {
        proposedStatus =
          artifactType === "task"
            ? mapJiraStatusForTask(jiraStatus, statusMap?.task)
            : mapJiraStatusForAction(jiraStatus, statusMap?.action);
      }
    }

    marvinArtifacts.push({
      id: fm.id as string,
      type: artifactType,
      title: fm.title as string,
      currentStatus: fm.status as string,
      proposedStatus,
      statusDrift: proposedStatus !== null && proposedStatus !== fm.status,
    });
  }

  // Smart link suggestions (only for unlinked issues)
  const linkSuggestions: LinkSuggestion[] =
    marvinArtifacts.length === 0
      ? findLinkSuggestions(issue.fields.summary, allDocs)
      : [];

  return {
    key: issue.key,
    summary: issue.fields.summary,
    currentStatus: issue.fields.status?.name ?? "Unknown",
    issueType: issue.fields.issuetype?.name ?? "Unknown",
    assignee: issue.fields.assignee?.displayName ?? null,
    changes,
    comments,
    linkedIssues,
    confluenceLinks,
    marvinArtifacts,
    linkSuggestions,
  };
}

function generateProposedActions(issues: DailyIssueEntry[]): ProposedAction[] {
  const actions: ProposedAction[] = [];

  for (const issue of issues) {
    // Status drift
    for (const artifact of issue.marvinArtifacts) {
      if (artifact.statusDrift && artifact.proposedStatus) {
        actions.push({
          type: "status-update",
          description: `Update ${artifact.id} (${artifact.type}) status: ${artifact.currentStatus} → ${artifact.proposedStatus} (Jira ${issue.key} is "${issue.currentStatus}")`,
          artifactId: artifact.id,
          jiraKey: issue.key,
        });
      }
    }

    // Unlinked issues with activity
    if (issue.marvinArtifacts.length === 0 && (issue.changes.length > 0 || issue.comments.length > 0)) {
      actions.push({
        type: "unlinked-issue",
        description: `${issue.key} ("${issue.summary}") has activity but no Marvin artifact — consider linking or creating one`,
        jiraKey: issue.key,
      });
    }

    // Link suggestions for unlinked issues
    for (const suggestion of issue.linkSuggestions) {
      actions.push({
        type: "link-suggestion",
        description: `${issue.key} ("${issue.summary}") may match ${suggestion.artifactId} ("${suggestion.artifactTitle}") — shared terms: ${suggestion.sharedTerms.join(", ")} (${Math.round(suggestion.score * 100)}% similarity)`,
        artifactId: suggestion.artifactId,
        jiraKey: issue.key,
      });
    }

    // Comment-based signals
    for (const comment of issue.comments) {
      for (const signal of comment.signals) {
        if (signal.type === "blocker") {
          actions.push({
            type: "blocker-detected",
            description: `Blocker in ${issue.key} comment by ${comment.author}: "${signal.snippet}"`,
            jiraKey: issue.key,
          });
        }
        if (signal.type === "decision") {
          actions.push({
            type: "decision-candidate",
            description: `Possible decision in ${issue.key} comment by ${comment.author}: "${signal.snippet}" — consider creating a decision artifact`,
            jiraKey: issue.key,
          });
        }
        if (signal.type === "question") {
          // Check if linked to a question artifact, or suggest creating one
          const linkedQuestion = issue.marvinArtifacts.find(
            (a) => a.type === "question" && a.currentStatus !== "answered",
          );
          if (linkedQuestion) {
            actions.push({
              type: "question-candidate",
              description: `Question in ${issue.key} comment by ${comment.author} — may relate to ${linkedQuestion.id} ("${linkedQuestion.title}"): "${signal.snippet}"`,
              artifactId: linkedQuestion.id,
              jiraKey: issue.key,
            });
          } else {
            actions.push({
              type: "question-candidate",
              description: `Question in ${issue.key} comment by ${comment.author}: "${signal.snippet}" — consider creating a question artifact`,
              jiraKey: issue.key,
            });
          }
        }
        if (signal.type === "resolution") {
          // Check if linked to a question that could be answered
          const linkedQuestion = issue.marvinArtifacts.find(
            (a) => a.type === "question" && a.currentStatus !== "answered",
          );
          if (linkedQuestion) {
            actions.push({
              type: "resolution-detected",
              description: `Resolution in ${issue.key} by ${comment.author} may answer ${linkedQuestion.id} ("${linkedQuestion.title}"): "${signal.snippet}"`,
              artifactId: linkedQuestion.id,
              jiraKey: issue.key,
            });
          }
        }
      }
    }

    // Confluence pages to review
    for (const cl of issue.confluenceLinks) {
      actions.push({
        type: "confluence-review",
        description: `Confluence page "${cl.title}" linked from ${issue.key} — review for relevant updates`,
        jiraKey: issue.key,
      });
    }
  }

  return actions;
}
