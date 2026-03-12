import type { PersonaPageContext } from "../../../persona-views.js";
import { getSprintSummaryData } from "../../../data.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge } from "../../layout.js";
import { renderWorkItemsTable, computeOwnerCompletionPct } from "../../components/work-items-table.js";

function progressBar(pct: number): string {
  return `<div class="sprint-progress-bar">
    <div class="sprint-progress-fill" style="width: ${pct}%"></div>
    <span class="sprint-progress-label">${pct}%</span>
  </div>`;
}

export function dmSprintPage(ctx: PersonaPageContext): string {
  const data = getSprintSummaryData(ctx.store);

  if (!data) {
    return `
      <div class="page-header">
        <h2>Sprint Execution</h2>
        <div class="subtitle">Full sprint oversight and delivery tracking</div>
      </div>
      <div class="empty">
        <h3>No Active Sprint</h3>
        <p>No active sprint found. Create a sprint and set its status to "active" to track execution.</p>
      </div>`;
  }

  const dmCompletionPct = computeOwnerCompletionPct(data.workItems.items, "dm");

  const goalHtml = data.sprint.goal
    ? `<div class="sprint-goal"><strong>Goal:</strong> ${escapeHtml(data.sprint.goal)}</div>`
    : "";

  const dateRange = data.sprint.startDate && data.sprint.endDate
    ? `<span class="text-dim">${formatDate(data.sprint.startDate)} — ${formatDate(data.sprint.endDate)}</span>`
    : "";

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Sprint Completion</div>
        <div class="card-value">${data.workItems.completionPct}%</div>
        <div class="card-sub">${data.workItems.done} / ${data.workItems.total} items done</div>
      </div>
      <div class="card">
        <div class="card-label">DM Completion</div>
        <div class="card-value">${dmCompletionPct}%</div>
        <div class="card-sub">DM-owned items</div>
      </div>
      <div class="card">
        <div class="card-label">Days Remaining</div>
        <div class="card-value">${data.timeline.daysRemaining}</div>
        <div class="card-sub">${data.timeline.daysElapsed} of ${data.timeline.totalDays} elapsed</div>
      </div>
      <a class="card card-link" href="sprint-blockers">
        <div class="card-label">Blockers</div>
        <div class="card-value${data.blockers.length > 0 ? " priority-high" : ""}">${data.blockers.length}</div>
        <div class="card-sub">${data.workItems.blocked} blocked items</div>
      </a>
      <a class="card card-link" href="sprint-risks">
        <div class="card-label">Risks</div>
        <div class="card-value${data.risks.length > 0 ? " priority-medium" : ""}">${data.risks.length}</div>
        <div class="card-sub">open risk items</div>
      </a>
    </div>`;

  // Full work items table (DM sees everything, with owner badges)
  const workItemsSection = renderWorkItemsTable(data.workItems.items, {
    sectionId: "dm-sprint-items",
    title: "Sprint Work Items",
    showOwner: true,
  });

  // Linked epics
  const epicsSection = data.linkedEpics.length > 0
    ? collapsibleSection(
        "dm-sprint-epics",
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

  // Open actions
  const actionsSection = data.openActions.length > 0
    ? collapsibleSection(
        "dm-sprint-actions",
        `Open Actions (${data.openActions.length})`,
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Owner</th><th>Due Date</th></tr>
            </thead>
            <tbody>
              ${data.openActions.map((a) => `
              <tr>
                <td><a href="/docs/action/${escapeHtml(a.id)}">${escapeHtml(a.id)}</a></td>
                <td>${escapeHtml(a.title)}</td>
                <td>${a.owner ? escapeHtml(a.owner) : '<span class="text-dim">—</span>'}</td>
                <td>${a.dueDate ? formatDate(a.dueDate) : '<span class="text-dim">—</span>'}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  // Meetings
  const meetingsSection = data.meetings.length > 0
    ? collapsibleSection(
        "dm-sprint-meetings",
        `Meetings (${data.meetings.length})`,
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>ID</th><th>Title</th></tr>
            </thead>
            <tbody>
              ${data.meetings.map((m) => `
              <tr>
                <td>${formatDate(m.date)}</td>
                <td><a href="/docs/meeting/${escapeHtml(m.id)}">${escapeHtml(m.id)}</a></td>
                <td>${escapeHtml(m.title)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3", defaultCollapsed: true },
      )
    : "";

  return `
    <div class="page-header">
      <h2>${escapeHtml(data.sprint.id)} — ${escapeHtml(data.sprint.title)} ${statusBadge(data.sprint.status)}</h2>
      <div class="subtitle">Sprint Execution ${dateRange}</div>
    </div>
    ${goalHtml}
    ${progressBar(data.timeline.percentComplete)}
    ${statsCards}
    ${workItemsSection}
    ${epicsSection}
    ${actionsSection}
    ${meetingsSection}
  `;
}
