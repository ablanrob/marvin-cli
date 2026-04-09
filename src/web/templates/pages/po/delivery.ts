import type { Document } from "../../../../storage/types.js";
import type { PersonaPageContext } from "../../../persona-views.js";
import { getSprintSummaryData } from "../../../data.js";
import {
  collapsibleSection,
  escapeHtml,
  formatDate,
  statusBadge,
  typeLabel,
} from "../../layout.js";
import {
  renderWorkItemsTable,
  computeOwnerCompletionPct,
  filterItemsByOwner,
} from "../../components/work-items-table.js";
import { normalizeLinkedFeatures } from "../../../../plugins/builtin/tools/epic-utils.js";
import { normalizeLinkedEpics } from "../../../../plugins/builtin/tools/task-utils.js";
import { getEffectiveProgress } from "../../../../storage/progress.js";
import { DONE_STATUSES } from "../../../../core/statuses.js";

const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const statusOrder: Record<string, number> = {
  "in-progress": 0,
  open: 1,
  draft: 2,
  blocked: 3,
  done: 4,
  closed: 5,
  resolved: 6,
};

function priorityClass(p?: string): string {
  if (!p) return "";
  const lower = p.toLowerCase();
  if (lower === "critical" || lower === "high") return " priority-high";
  if (lower === "medium") return " priority-medium";
  if (lower === "low") return " priority-low";
  return "";
}

function miniProgressBar(pct: number): string {
  return `<div class="mini-progress-bar"><div class="mini-progress-fill" style="width:${pct}%"></div><span class="mini-progress-label">${pct}%</span></div>`;
}

const PO_CONTRIBUTION_TYPES = new Set([
  "stakeholder-feedback",
  "acceptance-result",
  "priority-change",
  "market-insight",
]);

function progressBar(pct: number): string {
  return `<div class="sprint-progress-bar">
    <div class="sprint-progress-fill" style="width: ${pct}%"></div>
    <span class="sprint-progress-label">${pct}%</span>
  </div>`;
}

export function poDeliveryPage(ctx: PersonaPageContext): string {
  const data = getSprintSummaryData(ctx.store);

  if (!data) {
    return `
      <div class="page-header">
        <h2>Value Delivery</h2>
        <div class="subtitle">Sprint progress and PO contributions</div>
      </div>
      <div class="empty">
        <h3>No Active Sprint</h3>
        <p>No active sprint found. Create a sprint and set its status to "active" to track delivery.</p>
      </div>`;
  }

  // Filter work items to PO-owned items
  const poItems = filterItemsByOwner(data.workItems.items, "po");
  const poCompletionPct = computeOwnerCompletionPct(data.workItems.items, "po");

  // PO contributions from store
  const allDocs = ctx.store.list();
  const poContributions = allDocs.filter((d) => PO_CONTRIBUTION_TYPES.has(d.frontmatter.type));

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Sprint Progress</div>
        <div class="card-value">${data.workItems.completionPct}%</div>
        <div class="card-sub">${data.workItems.done} / ${data.workItems.total} items done</div>
      </div>
      <div class="card">
        <div class="card-label">PO Completion</div>
        <div class="card-value">${poCompletionPct}%</div>
        <div class="card-sub">${poItems.length} owned items</div>
      </div>
      <div class="card">
        <div class="card-label">Days Remaining</div>
        <div class="card-value">${data.timeline.daysRemaining}</div>
        <div class="card-sub">${data.timeline.daysElapsed} of ${data.timeline.totalDays} elapsed</div>
      </div>
      <div class="card">
        <div class="card-label">PO Contributions</div>
        <div class="card-value">${poContributions.length}</div>
        <div class="card-sub">feedback, reviews, insights</div>
      </div>
    </div>`;

  const sprintHeader = `
    <div class="sprint-goal">
      <strong>${escapeHtml(data.sprint.id)} — ${escapeHtml(data.sprint.title)}</strong>
      ${data.sprint.goal ? ` | ${escapeHtml(data.sprint.goal)}` : ""}
    </div>`;

  // PO work items with focus-grouped table
  const workItemsSection = renderWorkItemsTable(poItems, {
    sectionId: "po-delivery-items",
    title: "PO Work Items",
  });

  // Linked epics
  const epicsSection =
    data.linkedEpics.length > 0
      ? collapsibleSection(
          "po-delivery-epics",
          "Linked Epics",
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Status</th><th>Tasks Done</th></tr>
            </thead>
            <tbody>
              ${data.linkedEpics
                .map(
                  (e) => `
              <tr>
                <td><a href="/docs/epic/${escapeHtml(e.id)}">${escapeHtml(e.id)}</a></td>
                <td>${escapeHtml(e.title)}</td>
                <td>${statusBadge(e.status)}</td>
                <td>${e.tasksDone} / ${e.tasksTotal}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3" },
        )
      : "";

  // ── Priority Queue ──────────────────────────────────────────
  const features = ctx.store.list({ type: "feature" });
  const epics = ctx.store.list({ type: "epic" });
  const allTasks = ctx.store.list({ type: "task" });
  const sprints = ctx.store.list({ type: "sprint" });

  // Feature → Epics
  const featureToEpics = new Map<string, Document[]>();
  for (const epic of epics) {
    const featureIds = normalizeLinkedFeatures(epic.frontmatter.linkedFeature);
    for (const fid of featureIds) {
      const arr = featureToEpics.get(fid) ?? [];
      arr.push(epic);
      featureToEpics.set(fid, arr);
    }
  }

  // Epic → Tasks
  const epicToTasks = new Map<string, Document[]>();
  for (const task of allTasks) {
    const tags = (task.frontmatter.tags as string[]) ?? [];
    for (const tag of tags) {
      if (tag.startsWith("epic:")) {
        const arr = epicToTasks.get(tag.slice(5)) ?? [];
        arr.push(task);
        epicToTasks.set(tag.slice(5), arr);
      }
    }
  }

  // Active sprint epic IDs
  const activeSprint = sprints.find((s) => s.frontmatter.status === "active");
  const activeSprintEpicIds = new Set(
    activeSprint ? normalizeLinkedEpics(activeSprint.frontmatter.linkedEpics) : [],
  );

  function featureSprintLabel(featureId: string): string {
    if (!activeSprint) return "—";
    const fEpics = featureToEpics.get(featureId) ?? [];
    return fEpics.some((e) => activeSprintEpicIds.has(e.frontmatter.id))
      ? escapeHtml(activeSprint.frontmatter.id)
      : "—";
  }

  function featureProgress(featureId: string): number {
    const fEpics = featureToEpics.get(featureId) ?? [];
    let total = 0;
    let progressSum = 0;
    for (const epic of fEpics) {
      for (const t of epicToTasks.get(epic.frontmatter.id) ?? []) {
        total++;
        progressSum += getEffectiveProgress(t.frontmatter);
      }
    }
    return total > 0 ? Math.round(progressSum / total) : 0;
  }

  const nonDoneFeatures = features
    .filter((f) => !DONE_STATUSES.has(f.frontmatter.status))
    .sort((a, b) => {
      const pa = priorityOrder[(a.frontmatter.priority as string)?.toLowerCase()] ?? 99;
      const pb = priorityOrder[(b.frontmatter.priority as string)?.toLowerCase()] ?? 99;
      if (pa !== pb) return pa - pb;
      const sa = statusOrder[a.frontmatter.status] ?? 3;
      const sb = statusOrder[b.frontmatter.status] ?? 3;
      return sa - sb;
    });

  const priorityQueueSection = collapsibleSection(
    "po-priority-queue",
    `Priority Queue (${nonDoneFeatures.length})`,
    nonDoneFeatures.length > 0
      ? `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>Priority</th><th>ID</th><th>Title</th><th>Status</th><th>Sprint</th><th>Progress</th></tr>
            </thead>
            <tbody>
              ${nonDoneFeatures
                .map(
                  (f) => `
              <tr>
                <td><span class="${priorityClass(f.frontmatter.priority as string)}">${escapeHtml((f.frontmatter.priority as string) ?? "—")}</span></td>
                <td><a href="/docs/feature/${escapeHtml(f.frontmatter.id)}">${escapeHtml(f.frontmatter.id)}</a></td>
                <td>${escapeHtml(f.frontmatter.title)}</td>
                <td>${statusBadge(f.frontmatter.status)}</td>
                <td>${featureSprintLabel(f.frontmatter.id)}</td>
                <td>${miniProgressBar(featureProgress(f.frontmatter.id))}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`
      : '<div class="empty"><p>No active features in the queue.</p></div>',
    { titleTag: "h3" },
  );

  // PO contributions table
  const contributionsSection =
    poContributions.length > 0
      ? collapsibleSection(
          "po-delivery-contributions",
          `PO Contributions (${poContributions.length})`,
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Type</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              ${poContributions
                .map(
                  (d) => `
              <tr>
                <td><a href="/docs/${escapeHtml(d.frontmatter.type)}/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
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

  return `
    <div class="page-header">
      <h2>Value Delivery</h2>
      <div class="subtitle">Sprint progress and feature delivery tracking</div>
    </div>
    ${sprintHeader}
    ${progressBar(data.workItems.completionPct)}
    ${statsCards}
    ${workItemsSection}
    ${epicsSection}
    ${priorityQueueSection}
    ${contributionsSection}
  `;
}
