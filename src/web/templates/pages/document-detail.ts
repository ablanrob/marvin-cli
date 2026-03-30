import type { Document } from "../../../storage/types.js";
import type { AssessmentSummary } from "../../../skills/builtin/jira/sprint-progress.js";
import {
  escapeHtml,
  formatDate,
  statusBadge,
  typeLabel,
  renderMarkdown,
  integrationIcons,
  linkArtifactIds,
} from "../layout.js";

export function documentDetailPage(doc: Document): string {
  const fm = doc.frontmatter;
  const label = typeLabel(fm.type);

  // Keys to skip in the frontmatter definition list (rendered elsewhere or complex objects)
  const skipKeys = new Set(["title", "type", "assessmentHistory", "assessmentSummary"]);

  const entries = Object.entries(fm).filter(
    ([key, value]) => !skipKeys.has(key) && value != null && typeof value !== "object",
  );

  // Also render simple arrays (tags) but skip complex arrays/objects
  const arrayEntries = Object.entries(fm).filter(
    ([key, value]) => !skipKeys.has(key) && Array.isArray(value) && value.every(v => typeof v === "string"),
  );

  const allEntries = [
    ...entries.filter(([, v]) => !Array.isArray(v)),
    ...arrayEntries,
  ];

  const dtDd = allEntries
    .map(([key, value]) => {
      let rendered: string;
      if (key === "status") {
        rendered = statusBadge(value as string);
      } else if (key === "tags" && Array.isArray(value)) {
        rendered = (value as string[]).map((t) => `<span class="badge badge-default">${escapeHtml(t)}</span>`).join(" ");
      } else if (key === "created" || key === "updated" || key === "lastAssessedAt" || key === "lastJiraSyncAt") {
        rendered = formatDate(value as string);
      } else {
        rendered = linkArtifactIds(escapeHtml(String(value)));
      }
      return `<dt>${escapeHtml(key)}</dt><dd>${rendered}</dd>`;
    })
    .join("\n        ");

  // Assessment history timeline — validate and sanitize input
  const rawHistory = Array.isArray(fm.assessmentHistory)
    ? fm.assessmentHistory
    : fm.assessmentSummary && typeof fm.assessmentSummary === "object"
      ? [fm.assessmentSummary]
      : [];
  const assessmentHistory = (rawHistory as unknown[])
    .filter(isValidAssessmentEntry)
    .sort((a, b) => (b.generatedAt ?? "").localeCompare(a.generatedAt ?? ""));
  const timelineHtml = assessmentHistory.length > 0
    ? renderAssessmentTimeline(assessmentHistory)
    : "";

  return `
    <div class="breadcrumb">
      <a href="/">Overview</a><span class="sep">/</span>
      <a href="/docs/${fm.type}">${escapeHtml(label)}s</a><span class="sep">/</span>
      ${escapeHtml(fm.id)}
    </div>

    <div class="page-header">
      <h2>${escapeHtml(fm.title)}${integrationIcons(fm)}</h2>
      <div class="subtitle">${escapeHtml(fm.id)} &middot; ${escapeHtml(label)}</div>
    </div>

    <div class="detail-meta">
      <dl>
        ${dtDd}
      </dl>
    </div>

    ${
      doc.content.trim()
        ? `<div class="detail-content">${renderMarkdown(doc.content)}</div>`
        : ""
    }

    ${timelineHtml}
  `;
}

// --- Assessment Timeline ---

/** Type guard: checks that an unknown value has the expected AssessmentSummary shape */
function isValidAssessmentEntry(value: unknown): value is AssessmentSummary {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  // generatedAt is required; signals must be an array (or we normalize it)
  if (typeof obj.generatedAt !== "string") return false;
  if (obj.signals !== undefined && !Array.isArray(obj.signals)) return false;
  return true;
}

/** Safely normalize an AssessmentSummary entry — ensures all fields have safe defaults */
function normalizeEntry(entry: AssessmentSummary): AssessmentSummary {
  return {
    generatedAt: entry.generatedAt ?? "",
    commentSummary: typeof entry.commentSummary === "string" ? entry.commentSummary : null,
    commentAnalysisProgress: typeof entry.commentAnalysisProgress === "number" ? entry.commentAnalysisProgress : null,
    signals: Array.isArray(entry.signals) ? entry.signals.filter(s => typeof s === "string") : [],
    childCount: typeof entry.childCount === "number" ? entry.childCount : 0,
    childDoneCount: typeof entry.childDoneCount === "number" ? entry.childDoneCount : 0,
    childRollupProgress: typeof entry.childRollupProgress === "number" ? entry.childRollupProgress : null,
    linkedIssueCount: typeof entry.linkedIssueCount === "number" ? entry.linkedIssueCount : 0,
  };
}

function renderAssessmentTimeline(history: AssessmentSummary[]): string {
  const entries = history.map((raw, i) => {
    const entry = normalizeEntry(raw);
    const date = entry.generatedAt ? formatDate(entry.generatedAt) : "Unknown date";
    const time = entry.generatedAt?.slice(11, 16) ?? "";
    const isLatest = i === 0;

    const parts: string[] = [];

    if (entry.commentSummary) {
      parts.push(`<div class="assessment-comment">${linkArtifactIds(escapeHtml(entry.commentSummary))}</div>`);
    }

    if (entry.commentAnalysisProgress !== null) {
      parts.push(`<div class="assessment-stat">📊 Comment-derived progress: <strong>${entry.commentAnalysisProgress}%</strong></div>`);
    }

    if (entry.childCount > 0) {
      const bar = progressBarHtml(entry.childRollupProgress ?? 0);
      parts.push(`<div class="assessment-stat">👶 Children: ${entry.childDoneCount}/${entry.childCount} done ${bar} ${entry.childRollupProgress ?? 0}%</div>`);
    }

    if (entry.linkedIssueCount > 0) {
      parts.push(`<div class="assessment-stat">🔗 Linked issues: ${entry.linkedIssueCount}</div>`);
    }

    if (entry.signals.length > 0) {
      const signalItems = entry.signals
        .map(s => `<li>${linkArtifactIds(escapeHtml(s))}</li>`)
        .join("");
      parts.push(`<ul class="assessment-signals">${signalItems}</ul>`);
    }

    return `
      <div class="assessment-entry${isLatest ? " assessment-latest" : ""}">
        <div class="assessment-header">
          <span class="assessment-date">${escapeHtml(date)} ${escapeHtml(time)}</span>
          ${isLatest ? '<span class="badge badge-default">Latest</span>' : ""}
        </div>
        ${parts.join("\n")}
      </div>`;
  });

  return `
    <div class="assessment-timeline">
      <h3>Assessment History</h3>
      ${entries.join("\n")}
    </div>`;
}

function progressBarHtml(pct: number): string {
  const filled = Math.round(Math.max(0, Math.min(100, pct)) / 10);
  const empty = 10 - filled;
  return `<span class="progress-bar-inline">${"█".repeat(filled)}${"░".repeat(empty)}</span>`;
}
