import type { PersonaPageContext } from "../../../persona-views.js";
import { getSprintSummaryData, getDiagramData } from "../../../data.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge, typeLabel } from "../../layout.js";

const TL_CONTRIBUTION_TYPES = new Set([
  "action-result",
  "spike-findings",
  "technical-assessment",
  "architecture-review",
]);

const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);

function progressBar(pct: number): string {
  return `<div class="sprint-progress-bar">
    <div class="sprint-progress-fill" style="width: ${pct}%"></div>
    <span class="sprint-progress-label">${pct}%</span>
  </div>`;
}

export function tlSprintPage(ctx: PersonaPageContext): string {
  const data = getSprintSummaryData(ctx.store);

  if (!data) {
    return `
      <div class="page-header">
        <h2>Sprint Work</h2>
        <div class="subtitle">Technical sprint items and contributions</div>
      </div>
      <div class="empty">
        <h3>No Active Sprint</h3>
        <p>No active sprint found. Create a sprint and set its status to "active" to track sprint work.</p>
      </div>`;
  }

  // Filter work items to epics and tasks
  const techTypes = new Set(["epic", "task"]);
  const techItems = data.workItems.items.filter((w) => techTypes.has(w.type));
  const techDone = techItems.filter((w) => DONE_STATUSES.has(w.status)).length;

  // TL contributions from store
  const allDocs = ctx.store.list();
  const tlContributions = allDocs.filter((d) => TL_CONTRIBUTION_TYPES.has(d.frontmatter.type));

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Sprint Progress</div>
        <div class="card-value">${data.workItems.completionPct}%</div>
        <div class="card-sub">${data.timeline.daysRemaining} days remaining</div>
      </div>
      <div class="card">
        <div class="card-label">Tech Items</div>
        <div class="card-value">${techItems.length}</div>
        <div class="card-sub">${techDone} done</div>
      </div>
      <div class="card">
        <div class="card-label">Epics</div>
        <div class="card-value">${data.linkedEpics.length}</div>
        <div class="card-sub">linked to sprint</div>
      </div>
      <div class="card">
        <div class="card-label">TL Contributions</div>
        <div class="card-value">${tlContributions.length}</div>
        <div class="card-sub">reviews, spikes, assessments</div>
      </div>
    </div>`;

  const sprintHeader = `
    <div class="sprint-goal">
      <strong>${escapeHtml(data.sprint.id)} — ${escapeHtml(data.sprint.title)}</strong>
      ${data.sprint.goal ? ` | ${escapeHtml(data.sprint.goal)}` : ""}
    </div>`;

  // Sprint work items (epics + tasks only)
  const workItemsSection = techItems.length > 0
    ? collapsibleSection(
        "tl-sprint-items",
        `Sprint Work Items (${techItems.length})`,
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Type</th><th>Status</th><th>Stream</th></tr>
            </thead>
            <tbody>
              ${techItems.map((w) => `
              <tr>
                <td><a href="/docs/${escapeHtml(w.type)}/${escapeHtml(w.id)}">${escapeHtml(w.id)}</a></td>
                <td>${escapeHtml(w.title)}</td>
                <td>${escapeHtml(typeLabel(w.type))}</td>
                <td>${statusBadge(w.status)}</td>
                <td>${w.workStream ? `<span class="badge badge-subtle">${escapeHtml(w.workStream)}</span>` : '<span class="text-dim">—</span>'}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  // TL contributions
  const contributionsSection = tlContributions.length > 0
    ? collapsibleSection(
        "tl-sprint-contributions",
        `TL Contributions (${tlContributions.length})`,
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Type</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              ${tlContributions.map((d) => `
              <tr>
                <td><a href="/docs/${escapeHtml(d.frontmatter.type)}/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${escapeHtml(typeLabel(d.frontmatter.type))}</td>
                <td>${statusBadge(d.frontmatter.status)}</td>
                <td>${formatDate(d.frontmatter.updated ?? d.frontmatter.created)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  // Epics detail
  const epicsSection = data.linkedEpics.length > 0
    ? collapsibleSection(
        "tl-sprint-epics",
        "Linked Epics",
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Status</th><th>Tasks Done</th></tr>
            </thead>
            <tbody>
              ${data.linkedEpics.map((e) => `
              <tr>
                <td><a href="/docs/epic/${escapeHtml(e.id)}">${escapeHtml(e.id)}</a></td>
                <td>${escapeHtml(e.title)}</td>
                <td>${statusBadge(e.status)}</td>
                <td>${e.tasksDone} / ${e.tasksTotal}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  return `
    <div class="page-header">
      <h2>Sprint Work</h2>
      <div class="subtitle">Technical sprint items and contributions</div>
    </div>
    ${sprintHeader}
    ${progressBar(data.workItems.completionPct)}
    ${statsCards}
    ${workItemsSection}
    ${epicsSection}
    ${contributionsSection}
  `;
}
