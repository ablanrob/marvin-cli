import type { Document } from "../../../../storage/types.js";
import type { PersonaPageContext } from "../../../persona-views.js";
import {
  collapsibleSection,
  escapeHtml,
  formatDate,
  ownerBadge,
  statusBadge,
} from "../../layout.js";
import { renderTableUtilsScript, sortableTh, tableFilter } from "../../table-utils.js";
import { normalizeLinkedFeatures } from "../../../../plugins/builtin/tools/epic-utils.js";
import { getEffectiveProgress } from "../../../../storage/progress.js";
import { DONE_STATUSES } from "../../../../core/statuses.js";

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

export function poBacklogPage(ctx: PersonaPageContext): string {
  const features = ctx.store.list({ type: "feature" });
  const questions = ctx.store.list({ type: "question" });
  const openQuestions = questions.filter((d) => d.frontmatter.status === "open");

  // Sort features: open/in-progress first, then by priority, then by ID
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

  const sortedFeatures = [...features].sort((a, b) => {
    const sa = statusOrder[a.frontmatter.status] ?? 3;
    const sb = statusOrder[b.frontmatter.status] ?? 3;
    if (sa !== sb) return sa - sb;
    const pa = priorityOrder[(a.frontmatter.priority as string)?.toLowerCase()] ?? 99;
    const pb = priorityOrder[(b.frontmatter.priority as string)?.toLowerCase()] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.frontmatter.id.localeCompare(b.frontmatter.id);
  });

  // Feature → Epics (via epic's linkedFeature) — store full epic docs for task lookup
  const epics = ctx.store.list({ type: "epic" });
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
  const allTasks = ctx.store.list({ type: "task" });
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

  function featureTaskStats(featureId: string) {
    const fEpics = featureToEpics.get(featureId) ?? [];
    let total = 0;
    let done = 0;
    let progressSum = 0;
    for (const epic of fEpics) {
      for (const t of epicToTasks.get(epic.frontmatter.id) ?? []) {
        total++;
        if (DONE_STATUSES.has(t.frontmatter.status)) done++;
        progressSum += getEffectiveProgress(t.frontmatter);
      }
    }
    return {
      epicCount: fEpics.length,
      total,
      done,
      avgProgress: total > 0 ? Math.round(progressSum / total) : 0,
    };
  }

  // Unique filter values
  const featureStatuses = [...new Set(features.map((d) => d.frontmatter.status))].sort();
  const featurePriorities = [
    ...new Set(features.map((d) => (d.frontmatter.priority as string) ?? "").filter(Boolean)),
  ].sort();
  const featureEpicIds = [
    ...new Set(
      features.flatMap((d) =>
        (featureToEpics.get(d.frontmatter.id) ?? []).map((e) => e.frontmatter.id),
      ),
    ),
  ].sort();

  const featuresFilters = `<div class="filters">
    ${tableFilter("features-table", 2, "Status", featureStatuses)}
    ${tableFilter("features-table", 3, "Priority", featurePriorities)}
    ${featureEpicIds.length > 0 ? tableFilter("features-table", 4, "Epic", featureEpicIds) : ""}
  </div>`;

  const featuresTable =
    sortedFeatures.length > 0
      ? `${featuresFilters}
      <div class="table-wrap table-short">
        <table id="features-table">
          <thead>
            <tr>${sortableTh("ID", "features-table", 0)}${sortableTh("Title", "features-table", 1)}${sortableTh("Status", "features-table", 2)}${sortableTh("Priority", "features-table", 3)}<th>Epics</th><th>Tasks</th><th>Progress</th></tr>
          </thead>
          <tbody>
            ${sortedFeatures
              .map((d) => {
                const stats = featureTaskStats(d.frontmatter.id);
                const linkedEpicDocs = featureToEpics.get(d.frontmatter.id) ?? [];
                const epicLinks = linkedEpicDocs
                  .map(
                    (e) =>
                      `<a href="/docs/epic/${escapeHtml(e.frontmatter.id)}">${escapeHtml(e.frontmatter.id)}</a>`,
                  )
                  .join(", ");
                return `
            <tr>
              <td><a href="/docs/feature/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
              <td>${escapeHtml(d.frontmatter.title)}</td>
              <td>${statusBadge(d.frontmatter.status)}</td>
              <td><span class="${priorityClass(d.frontmatter.priority as string)}">${escapeHtml((d.frontmatter.priority as string) ?? "—")}</span></td>
              <td>${epicLinks || '<span class="text-dim">—</span>'}</td>
              <td>${stats.total > 0 ? `${stats.done}/${stats.total}` : '<span class="text-dim">—</span>'}</td>
              <td>${stats.total > 0 ? miniProgressBar(stats.avgProgress) : '<span class="text-dim">—</span>'}</td>
            </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`
      : '<div class="empty"><p>No features found.</p></div>';

  // Question owners for filter
  const questionOwners = [
    ...new Set(openQuestions.map((d) => d.frontmatter.owner).filter(Boolean) as string[]),
  ].sort();

  const questionsTable =
    openQuestions.length > 0
      ? collapsibleSection(
          "po-backlog-questions",
          `Open Questions (${openQuestions.length})`,
          `${questionOwners.length > 0 ? `<div class="filters">${tableFilter("questions-table", 2, "Owner", questionOwners)}</div>` : ""}
        <div class="table-wrap table-short">
          <table id="questions-table">
            <thead>
              <tr>${sortableTh("ID", "questions-table", 0)}${sortableTh("Title", "questions-table", 1)}${sortableTh("Owner", "questions-table", 2)}${sortableTh("Created", "questions-table", 3)}</tr>
            </thead>
            <tbody>
              ${openQuestions
                .map(
                  (d) => `
              <tr>
                <td><a href="/docs/question/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${ownerBadge(d.frontmatter.owner)}</td>
                <td>${formatDate(d.frontmatter.created)}</td>
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
      <h2>Product Backlog</h2>
      <div class="subtitle">${features.length} features, ${openQuestions.length} open questions</div>
    </div>
    ${collapsibleSection("po-backlog-features", `Features (${features.length})`, featuresTable, { titleTag: "h3" })}
    ${questionsTable}
    ${renderTableUtilsScript()}
  `;
}
