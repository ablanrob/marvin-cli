import type { PersonaPageContext } from "../../../persona-views.js";
import { getSprintSummaryData, getUpcomingData } from "../../../data.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge } from "../../layout.js";
import { DONE_STATUSES } from "../../../../core/statuses.js";

function progressBar(pct: number): string {
  return `<div class="sprint-progress-bar">
    <div class="sprint-progress-fill" style="width: ${pct}%"></div>
    <span class="sprint-progress-label">${pct}%</span>
  </div>`;
}

export function dmDashboardPage(ctx: PersonaPageContext): string {
  const sprintData = getSprintSummaryData(ctx.store);
  const upcoming = getUpcomingData(ctx.store);

  // Action stats
  const actions = ctx.store.list({ type: "action" });
  const openActions = actions.filter((d) => !DONE_STATUSES.has(d.frontmatter.status));
  const overdueActions = upcoming.dueSoonActions.filter((a) => a.urgency === "overdue");

  const statsCards = `
    <div class="cards">
      <div class="card">
        <a href="/dm/sprint">
          <div class="card-label">Sprint Progress</div>
          <div class="card-value">${sprintData ? `${sprintData.workItems.completionPct}%` : "—"}</div>
          <div class="card-sub">${sprintData ? `${sprintData.timeline.daysRemaining} days remaining` : "No active sprint"}</div>
        </a>
      </div>
      <div class="card">
        <a href="/dm/risks">
          <div class="card-label">Blockers</div>
          <div class="card-value${(sprintData?.blockers.length ?? 0) > 0 ? " priority-high" : ""}">${sprintData?.blockers.length ?? 0}</div>
          <div class="card-sub">blocking items</div>
        </a>
      </div>
      <div class="card">
        <a href="/dm/actions">
          <div class="card-label">Overdue Actions</div>
          <div class="card-value${overdueActions.length > 0 ? " priority-high" : ""}">${overdueActions.length}</div>
          <div class="card-sub">${openActions.length} open total</div>
        </a>
      </div>
      <div class="card">
        <a href="/dm/meetings">
          <div class="card-label">Meetings</div>
          <div class="card-value">${sprintData?.meetings.length ?? 0}</div>
          <div class="card-sub">this sprint</div>
        </a>
      </div>
    </div>`;

  const sprintProgress = sprintData
    ? `
      <div class="sprint-goal">
        <strong>${escapeHtml(sprintData.sprint.id)} — ${escapeHtml(sprintData.sprint.title)}</strong>
        ${sprintData.sprint.goal ? ` | ${escapeHtml(sprintData.sprint.goal)}` : ""}
      </div>
      ${progressBar(sprintData.workItems.completionPct)}`
    : "";

  // Risk indicators
  const riskItems: string[] = [];
  if (overdueActions.length > 0) riskItems.push(`${overdueActions.length} overdue action(s)`);
  if ((sprintData?.blockers.length ?? 0) > 0)
    riskItems.push(`${sprintData!.blockers.length} blocker(s)`);
  if (
    sprintData &&
    sprintData.timeline.daysRemaining <= 3 &&
    sprintData.workItems.completionPct < 80
  ) {
    riskItems.push("Sprint deadline approaching with low completion");
  }

  const riskSection =
    riskItems.length > 0
      ? `<div class="sprint-goal" style="border-left: 3px solid var(--red);">
        <strong>Risk Indicators</strong>
        <ul style="margin: 0.5rem 0 0 1.25rem; font-size: 0.875rem; color: var(--text-dim);">
          ${riskItems.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
        </ul>
      </div>`
      : "";

  // Due soon actions preview
  const dueSoonPreview = upcoming.dueSoonActions.slice(0, 5);
  const actionsPreview =
    dueSoonPreview.length > 0
      ? collapsibleSection(
          "dm-dash-actions",
          "Due Soon Actions",
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Owner</th><th>Due</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${dueSoonPreview
                .map(
                  (a) => `
              <tr>
                <td><a href="/docs/action/${escapeHtml(a.id)}">${escapeHtml(a.id)}</a></td>
                <td>${escapeHtml(a.title)}</td>
                <td>${a.owner ? escapeHtml(a.owner) : '<span class="text-dim">—</span>'}</td>
                <td>${formatDate(a.dueDate)}</td>
                <td>${statusBadge(a.status)}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <p style="margin-top: 0.5rem; font-size: 0.85rem;"><a href="/dm/actions">View all actions &rarr;</a></p>`,
          { titleTag: "h3" },
        )
      : "";

  return `
    <div class="page-header">
      <h2>Delivery Manager Dashboard</h2>
      <div class="subtitle">Sprint execution, action tracking, and risk management</div>
    </div>
    ${sprintProgress}
    ${statsCards}
    ${riskSection}
    ${actionsPreview}
  `;
}
