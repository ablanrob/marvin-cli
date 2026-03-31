import type { PersonaPageContext } from "../../../persona-views.js";
import { getUpcomingData, type UrgencyTier } from "../../../data.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge } from "../../layout.js";

const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);

function urgencyBadge(tier: UrgencyTier): string {
  const labels: Record<UrgencyTier, string> = {
    overdue: "Overdue",
    "due-3d": "Due in 3d",
    "due-7d": "Due in 7d",
    upcoming: "Upcoming",
    later: "Later",
  };
  return `<span class="badge urgency-badge-${tier}">${labels[tier]}</span>`;
}

function urgencyRowClass(tier: UrgencyTier): string {
  if (tier === "overdue") return " urgency-row-overdue";
  if (tier === "due-3d") return " urgency-row-due-3d";
  if (tier === "due-7d") return " urgency-row-due-7d";
  return "";
}

export function dmActionsPage(ctx: PersonaPageContext): string {
  const upcoming = getUpcomingData(ctx.store);
  const allActions = ctx.store.list({ type: "action" });
  const openActions = allActions.filter((d) => !DONE_STATUSES.has(d.frontmatter.status));
  const overdueActions = upcoming.dueSoonActions.filter((a) => a.urgency === "overdue");
  const dueThisWeek = upcoming.dueSoonActions.filter(
    (a) => a.urgency === "due-3d" || a.urgency === "due-7d",
  );
  const unownedActions = openActions.filter((d) => !d.frontmatter.owner);

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Total Open</div>
        <div class="card-value">${openActions.length}</div>
        <div class="card-sub">${allActions.length} total actions</div>
      </div>
      <div class="card">
        <div class="card-label">Overdue</div>
        <div class="card-value${overdueActions.length > 0 ? " priority-high" : ""}">${overdueActions.length}</div>
        <div class="card-sub">past due date</div>
      </div>
      <div class="card">
        <div class="card-label">Due This Week</div>
        <div class="card-value${dueThisWeek.length > 0 ? " priority-medium" : ""}">${dueThisWeek.length}</div>
        <div class="card-sub">next 7 days</div>
      </div>
      <div class="card">
        <div class="card-label">Unowned</div>
        <div class="card-value${unownedActions.length > 0 ? " priority-medium" : ""}">${unownedActions.length}</div>
        <div class="card-sub">need assignment</div>
      </div>
    </div>`;

  // Actions with due dates sorted by urgency
  const dueSoonSection =
    upcoming.dueSoonActions.length > 0
      ? collapsibleSection(
          "dm-actions-due",
          `Actions by Due Date (${upcoming.dueSoonActions.length})`,
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Status</th><th>Owner</th><th>Due Date</th><th>Urgency</th></tr>
            </thead>
            <tbody>
              ${upcoming.dueSoonActions
                .map(
                  (a) => `
              <tr class="${urgencyRowClass(a.urgency)}">
                <td><a href="/docs/action/${escapeHtml(a.id)}">${escapeHtml(a.id)}</a></td>
                <td>${escapeHtml(a.title)}</td>
                <td>${statusBadge(a.status)}</td>
                <td>${a.owner ? escapeHtml(a.owner) : '<span class="text-dim">—</span>'}</td>
                <td>${formatDate(a.dueDate)}</td>
                <td>${urgencyBadge(a.urgency)}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3" },
        )
      : "";

  // Actions without due dates
  const noDueDateActions = openActions.filter((d) => !d.frontmatter.dueDate);
  const noDueDateSection =
    noDueDateActions.length > 0
      ? collapsibleSection(
          "dm-actions-nodate",
          `Actions Without Due Date (${noDueDateActions.length})`,
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Status</th><th>Owner</th><th>Created</th></tr>
            </thead>
            <tbody>
              ${noDueDateActions
                .map(
                  (d) => `
              <tr>
                <td><a href="/docs/action/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${statusBadge(d.frontmatter.status)}</td>
                <td>${d.frontmatter.owner ? escapeHtml(d.frontmatter.owner) : '<span class="text-dim">—</span>'}</td>
                <td>${formatDate(d.frontmatter.created)}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3", defaultCollapsed: true },
        )
      : "";

  return `
    <div class="page-header">
      <h2>Action Tracker</h2>
      <div class="subtitle">Track and manage all action items across the project</div>
    </div>
    ${statsCards}
    ${dueSoonSection}
    ${noDueDateSection}
  `;
}
