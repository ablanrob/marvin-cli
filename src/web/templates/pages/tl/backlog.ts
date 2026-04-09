import type { PersonaPageContext } from "../../../persona-views.js";
import { getBoardData } from "../../../data.js";
import {
  collapsibleSection,
  escapeHtml,
  formatDate,
  ownerBadge,
  statusBadge,
} from "../../layout.js";
import { DONE_STATUSES } from "../../../../core/statuses.js";

export function tlBacklogPage(ctx: PersonaPageContext): string {
  const epics = ctx.store.list({ type: "epic" });
  const tasks = ctx.store.list({ type: "task" });

  // Epic → task mapping
  const epicToTasks = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const tags = (task.frontmatter.tags as string[]) ?? [];
    for (const tag of tags) {
      if (tag.startsWith("epic:")) {
        const epicId = tag.slice(5);
        const existing = epicToTasks.get(epicId) ?? [];
        existing.push(task);
        epicToTasks.set(epicId, existing);
      }
    }
  }

  // Epic → linked feature
  const epicFeatureMap = new Map<string, string[]>();
  for (const epic of epics) {
    const linked = epic.frontmatter.linkedFeature;
    const featureIds = Array.isArray(linked) ? linked.map(String) : linked ? [String(linked)] : [];
    epicFeatureMap.set(epic.frontmatter.id, featureIds);
  }

  // Sort epics: open/in-progress first
  const statusOrder: Record<string, number> = {
    "in-progress": 0,
    open: 1,
    draft: 2,
    blocked: 3,
    done: 4,
    closed: 5,
    resolved: 6,
  };
  const sortedEpics = [...epics].sort((a, b) => {
    const sa = statusOrder[a.frontmatter.status] ?? 3;
    const sb = statusOrder[b.frontmatter.status] ?? 3;
    if (sa !== sb) return sa - sb;
    return a.frontmatter.id.localeCompare(b.frontmatter.id);
  });

  const epicsTable =
    sortedEpics.length > 0
      ? `<div class="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Title</th><th>Status</th><th>Tasks</th><th>Linked Feature</th></tr>
          </thead>
          <tbody>
            ${sortedEpics
              .map((e) => {
                const eTasks = epicToTasks.get(e.frontmatter.id) ?? [];
                const done = eTasks.filter((t) => DONE_STATUSES.has(t.frontmatter.status)).length;
                const featureIds = epicFeatureMap.get(e.frontmatter.id) ?? [];
                const featureLinks = featureIds
                  .map((fid) => `<a href="/docs/feature/${escapeHtml(fid)}">${escapeHtml(fid)}</a>`)
                  .join(", ");
                return `
            <tr>
              <td><a href="/docs/epic/${escapeHtml(e.frontmatter.id)}">${escapeHtml(e.frontmatter.id)}</a></td>
              <td>${escapeHtml(e.frontmatter.title)}</td>
              <td>${statusBadge(e.frontmatter.status)}</td>
              <td>${done}/${eTasks.length}</td>
              <td>${featureLinks || '<span class="text-dim">—</span>'}</td>
            </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`
      : '<div class="empty"><p>No epics found.</p></div>';

  // Unassigned tasks (not tagged to any epic)
  const assignedTaskIds = new Set<string>();
  for (const taskList of epicToTasks.values()) {
    for (const t of taskList) assignedTaskIds.add(t.frontmatter.id);
  }
  const unassignedTasks = tasks.filter(
    (t) => !assignedTaskIds.has(t.frontmatter.id) && !DONE_STATUSES.has(t.frontmatter.status),
  );

  const unassignedSection =
    unassignedTasks.length > 0
      ? collapsibleSection(
          "tl-backlog-unassigned",
          `Unassigned Tasks (${unassignedTasks.length})`,
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Status</th><th>Owner</th><th>Created</th></tr>
            </thead>
            <tbody>
              ${unassignedTasks
                .map(
                  (t) => `
              <tr>
                <td><a href="/docs/task/${escapeHtml(t.frontmatter.id)}">${escapeHtml(t.frontmatter.id)}</a></td>
                <td>${escapeHtml(t.frontmatter.title)}</td>
                <td>${statusBadge(t.frontmatter.status)}</td>
                <td>${ownerBadge(t.frontmatter.owner)}</td>
                <td>${formatDate(t.frontmatter.created)}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3" },
        )
      : "";

  // Task board view
  const taskBoard = getBoardData(ctx.store, "task");
  const boardHtml =
    taskBoard.columns.length > 0
      ? `<div class="board">
        ${taskBoard.columns
          .map(
            (col) => `
        <div class="board-column">
          <div class="board-column-header">
            <span>${escapeHtml(col.status)}</span>
            <span class="count">${col.docs.length}</span>
          </div>
          ${col.docs
            .map(
              (d) => `
          <div class="board-card">
            <a href="/docs/task/${escapeHtml(d.frontmatter.id)}">
              <div class="bc-id">${escapeHtml(d.frontmatter.id)}</div>
              <div class="bc-title">${escapeHtml(d.frontmatter.title)}</div>
              ${d.frontmatter.owner ? `<div class="bc-owner">${ownerBadge(d.frontmatter.owner)}</div>` : ""}
            </a>
          </div>`,
            )
            .join("")}
        </div>`,
          )
          .join("")}
      </div>`
      : "";

  const boardSection = boardHtml
    ? collapsibleSection("tl-backlog-board", "Task Board", boardHtml, {
        titleTag: "h3",
        defaultCollapsed: true,
      })
    : "";

  return `
    <div class="page-header">
      <h2>Technical Backlog</h2>
      <div class="subtitle">${epics.length} epics, ${tasks.length} tasks</div>
    </div>
    ${collapsibleSection("tl-backlog-epics", `Epics (${epics.length})`, epicsTable, { titleTag: "h3" })}
    ${unassignedSection}
    ${boardSection}
  `;
}
