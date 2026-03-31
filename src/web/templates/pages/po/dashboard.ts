import type { Document } from "../../../../storage/types.js";
import type { PersonaPageContext } from "../../../persona-views.js";
import { getOverviewData, getSprintSummaryData, getDiagramData } from "../../../data.js";
import { buildArtifactFlowchart } from "../../mermaid.js";
import {
  collapsibleSection,
  escapeHtml,
  formatDate,
  statusBadge,
  typeLabel,
} from "../../layout.js";
import { normalizeLinkedFeatures } from "../../../../plugins/builtin/tools/epic-utils.js";
import { getEffectiveProgress } from "../../../../storage/progress.js";

const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);
const RESOLVED_DECISION_STATUSES = new Set(["decided", "superseded", "dismissed"]);

export function poDashboardPage(ctx: PersonaPageContext): string {
  const overview = getOverviewData(ctx.store);
  const sprintData = getSprintSummaryData(ctx.store);
  const diagrams = getDiagramData(ctx.store);

  // ── Shared data for stats + at-risk ──────────────────────────
  const features = ctx.store.list({ type: "feature" });
  const epics = ctx.store.list({ type: "epic" });
  const allTasks = ctx.store.list({ type: "task" });
  const decisions = ctx.store.list({ type: "decision" });
  const questions = ctx.store.list({ type: "question" });
  const sprints = ctx.store.list({ type: "sprint" });

  // Feature → Epics (via epic's linkedFeature)
  const featureToEpics = new Map<string, Document[]>();
  for (const epic of epics) {
    const featureIds = normalizeLinkedFeatures(epic.frontmatter.linkedFeature);
    for (const fid of featureIds) {
      const arr = featureToEpics.get(fid) ?? [];
      arr.push(epic);
      featureToEpics.set(fid, arr);
    }
  }

  // Epic → Tasks (via task tags epic:<id>)
  const epicToTasks = new Map<string, Document[]>();
  for (const task of allTasks) {
    const tags = (task.frontmatter.tags as string[]) ?? [];
    for (const tag of tags) {
      if (tag.startsWith("epic:")) {
        const epicId = tag.slice(5);
        const arr = epicToTasks.get(epicId) ?? [];
        arr.push(task);
        epicToTasks.set(epicId, arr);
      }
    }
  }

  // Sprint timeline % elapsed
  const activeSprint = sprints.find((s) => s.frontmatter.status === "active");
  let sprintTimelinePct = 0;
  if (activeSprint) {
    const startDate = activeSprint.frontmatter.startDate as string | undefined;
    const endDate = activeSprint.frontmatter.endDate as string | undefined;
    if (startDate && endDate) {
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      const totalDays = Math.max(1, endMs - startMs);
      sprintTimelinePct = Math.min(
        100,
        Math.max(0, Math.round(((Date.now() - startMs) / totalDays) * 100)),
      );
    }
  }

  // ── Stats cards ──────────────────────────────────────────────
  const featuresDone = features.filter((d) => DONE_STATUSES.has(d.frontmatter.status)).length;
  const featuresOpen = features.filter((d) => d.frontmatter.status === "open").length;
  const featuresInProgress = features.filter((d) => d.frontmatter.status === "in-progress").length;
  const decisionsOpen = decisions.filter(
    (d) => !RESOLVED_DECISION_STATUSES.has(d.frontmatter.status),
  ).length;
  const questionsOpen = questions.filter((d) => d.frontmatter.status === "open").length;

  const statsCards = `
    <div class="cards">
      <div class="card">
        <a href="/po/backlog">
          <div class="card-label">Features</div>
          <div class="card-value">${features.length}</div>
          <div class="card-sub">${featuresDone} done, ${featuresInProgress} in progress, ${featuresOpen} open</div>
        </a>
      </div>
      <div class="card">
        <a href="/po/decisions">
          <div class="card-label">Pending Decisions</div>
          <div class="card-value${decisionsOpen > 0 ? " priority-medium" : ""}">${decisionsOpen}</div>
          <div class="card-sub">${decisions.length} total decisions</div>
        </a>
      </div>
      <div class="card">
        <a href="/po/backlog">
          <div class="card-label">Open Questions</div>
          <div class="card-value${questionsOpen > 0 ? " priority-medium" : ""}">${questionsOpen}</div>
          <div class="card-sub">${questions.length} total questions</div>
        </a>
      </div>
      <div class="card">
        <a href="/po/delivery">
          <div class="card-label">Current Sprint</div>
          <div class="card-value">${sprintData ? `${sprintData.workItems.completionPct}%` : "—"}</div>
          <div class="card-sub">${sprintData ? `${sprintData.workItems.done}/${sprintData.workItems.total} items` : "No active sprint"}</div>
        </a>
      </div>
    </div>`;

  // ── Product hierarchy diagram ────────────────────────────────
  const diagramSection = collapsibleSection(
    "po-dash-diagram",
    "Product Hierarchy",
    buildArtifactFlowchart(diagrams),
    { titleTag: "h3" },
  );

  // ── Recent activity ──────────────────────────────────────────
  const poTypes = new Set(["feature", "decision", "question"]);
  const poRecent = overview.recent.filter((d) => poTypes.has(d.frontmatter.type)).slice(0, 10);

  const recentTable =
    poRecent.length > 0
      ? collapsibleSection(
          "po-recent",
          "Recent Activity",
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Type</th><th>Status</th><th>Updated</th></tr>
            </thead>
            <tbody>
              ${poRecent
                .map(
                  (d) => `
              <tr>
                <td><a href="/docs/${d.frontmatter.type}/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${escapeHtml(typeLabel(d.frontmatter.type))}</td>
                <td>${statusBadge(d.frontmatter.status)}</td>
                <td>${formatDate(d.frontmatter.updated ?? d.frontmatter.created)}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3" },
        )
      : "";

  // ── At-Risk Delivery (compact) ───────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  interface RiskItem {
    feature: Document;
    reasons: string[];
  }

  const atRiskItems: RiskItem[] = [];
  for (const f of features) {
    if (DONE_STATUSES.has(f.frontmatter.status)) continue;
    const fEpics = featureToEpics.get(f.frontmatter.id) ?? [];
    const reasons: string[] = [];

    // Blocked tasks
    let blocked = 0;
    for (const epic of fEpics) {
      for (const t of epicToTasks.get(epic.frontmatter.id) ?? []) {
        if (t.frontmatter.status === "blocked") blocked++;
      }
    }
    if (blocked > 0) reasons.push(`${blocked} blocked task${blocked > 1 ? "s" : ""}`);

    // Overdue epics
    for (const epic of fEpics) {
      const td = epic.frontmatter.targetDate as string | undefined;
      if (td && td < today && !DONE_STATUSES.has(epic.frontmatter.status)) {
        reasons.push(`${epic.frontmatter.id} overdue`);
      }
    }

    // Low progress vs sprint timeline
    let totalTasks = 0;
    let progressSum = 0;
    for (const epic of fEpics) {
      for (const t of epicToTasks.get(epic.frontmatter.id) ?? []) {
        totalTasks++;
        progressSum += getEffectiveProgress(t.frontmatter);
      }
    }
    const avgProgress = totalTasks > 0 ? Math.round(progressSum / totalTasks) : 0;
    if (avgProgress < 30 && sprintTimelinePct > 60 && totalTasks > 0) {
      reasons.push("Low progress vs sprint timeline");
    }

    if (reasons.length > 0) atRiskItems.push({ feature: f, reasons });
  }

  const atRiskSection =
    atRiskItems.length > 0
      ? collapsibleSection(
          "po-at-risk",
          `At-Risk Delivery (${atRiskItems.length})`,
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>Feature</th><th>Risk Reasons</th></tr>
            </thead>
            <tbody>
              ${atRiskItems
                .map(
                  (r) => `
              <tr>
                <td><a href="/docs/feature/${escapeHtml(r.feature.frontmatter.id)}">${escapeHtml(r.feature.frontmatter.id)}</a> ${escapeHtml(r.feature.frontmatter.title)}</td>
                <td>${r.reasons.map((reason) => `<span class="signal-tag signal-tag-high">${escapeHtml(reason)}</span>`).join(" ")}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3" },
        )
      : collapsibleSection(
          "po-at-risk",
          "At-Risk Delivery",
          '<div class="empty"><p style="color: var(--green);">No at-risk items — all features on track.</p></div>',
          { titleTag: "h3", defaultCollapsed: true },
        );

  return `
    <div class="page-header">
      <h2>Product Owner Dashboard</h2>
      <div class="subtitle">Feature delivery, decisions, and stakeholder alignment</div>
    </div>
    ${statsCards}
    ${atRiskSection}
    ${diagramSection}
    ${recentTable}
  `;
}
