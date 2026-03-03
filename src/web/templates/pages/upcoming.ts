import type { UpcomingData, UrgencyTier } from "../../data.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge, typeLabel } from "../layout.js";

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

export function upcomingPage(data: UpcomingData): string {
  const hasActions = data.dueSoonActions.length > 0;
  const hasSprintTasks = data.dueSoonSprintTasks.length > 0;
  const hasTrending = data.trending.length > 0;

  const actionsTable = hasActions
    ? collapsibleSection(
        "upcoming-actions",
        "Due Soon — Actions",
        `<div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Due Date</th>
            <th>Urgency</th>
            <th>Tasks</th>
          </tr>
        </thead>
        <tbody>
          ${data.dueSoonActions
            .map(
              (a) => `
          <tr class="${urgencyRowClass(a.urgency)}">
            <td><a href="/docs/action/${escapeHtml(a.id)}">${escapeHtml(a.id)}</a></td>
            <td>${escapeHtml(a.title)}</td>
            <td>${statusBadge(a.status)}</td>
            <td>${a.owner ? escapeHtml(a.owner) : '<span class="text-dim">—</span>'}</td>
            <td>${formatDate(a.dueDate)}</td>
            <td>${urgencyBadge(a.urgency)}</td>
            <td>${a.relatedTaskCount > 0 ? a.relatedTaskCount : "—"}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`,
        { titleTag: "h3" },
      )
    : "";

  const sprintTasksTable = hasSprintTasks
    ? collapsibleSection(
        "upcoming-sprint-tasks",
        "Due Soon — Sprint Tasks",
        `<div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Sprint</th>
            <th>Sprint Ends</th>
            <th>Urgency</th>
          </tr>
        </thead>
        <tbody>
          ${data.dueSoonSprintTasks
            .map(
              (t) => `
          <tr class="${urgencyRowClass(t.urgency)}">
            <td><a href="/docs/task/${escapeHtml(t.id)}">${escapeHtml(t.id)}</a></td>
            <td>${escapeHtml(t.title)}</td>
            <td>${statusBadge(t.status)}</td>
            <td><a href="/docs/sprint/${escapeHtml(t.sprintId)}">${escapeHtml(t.sprintId)}</a></td>
            <td>${formatDate(t.sprintEndDate)}</td>
            <td>${urgencyBadge(t.urgency)}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`,
        { titleTag: "h3" },
      )
    : "";

  const trendingTable = hasTrending
    ? collapsibleSection(
        "upcoming-trending",
        "Trending",
        `<div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>ID</th>
            <th>Title</th>
            <th>Type</th>
            <th>Status</th>
            <th>Score</th>
            <th>Signals</th>
          </tr>
        </thead>
        <tbody>
          ${data.trending
            .map(
              (t, i) => `
          <tr>
            <td><span class="trending-rank">${i + 1}</span></td>
            <td><a href="/docs/${escapeHtml(t.type)}/${escapeHtml(t.id)}">${escapeHtml(t.id)}</a></td>
            <td>${escapeHtml(t.title)}</td>
            <td>${escapeHtml(typeLabel(t.type))}</td>
            <td>${statusBadge(t.status)}</td>
            <td><span class="trending-score">${t.score}</span></td>
            <td>${t.signals.map((s) => `<span class="signal-tag">${escapeHtml(s.factor)} +${s.points}</span>`).join(" ")}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`,
        { titleTag: "h3" },
      )
    : "";

  const emptyState =
    !hasActions && !hasSprintTasks && !hasTrending
      ? '<div class="empty"><p>No upcoming items or trending activity found.</p></div>'
      : "";

  return `
    <div class="page-header">
      <h2>Upcoming</h2>
      <div class="subtitle">Time-sensitive items and trending activity</div>
    </div>
    ${actionsTable}
    ${sprintTasksTable}
    ${trendingTable}
    ${emptyState}
  `;
}
