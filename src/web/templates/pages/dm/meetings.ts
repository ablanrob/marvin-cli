import type { PersonaPageContext } from "../../../persona-views.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge } from "../../layout.js";

const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);

export function dmMeetingsPage(ctx: PersonaPageContext): string {
  const meetings = ctx.store.list({ type: "meeting" });
  const actions = ctx.store.list({ type: "action" });

  // Sort meetings by date (most recent first)
  const sortedMeetings = [...meetings].sort((a, b) => {
    const dateA = (a.frontmatter.date as string) ?? a.frontmatter.created;
    const dateB = (b.frontmatter.date as string) ?? b.frontmatter.created;
    return dateB.localeCompare(dateA);
  });

  // Cross-reference: find actions that mention meetings in their content or tags
  const meetingActionMap = new Map<string, typeof actions>();
  for (const meeting of meetings) {
    const mid = meeting.frontmatter.id;
    const relatedActions = actions.filter((a) => {
      const tags = (a.frontmatter.tags as string[]) ?? [];
      const hasMeetingTag = tags.some((t) => t.startsWith("meeting:") && t.slice(8) === mid);
      const mentionsInContent = (a.content ?? "").includes(mid);
      const source = a.frontmatter.source;
      const fromMeeting = typeof source === "string" && source.includes(mid);
      return hasMeetingTag || mentionsInContent || fromMeeting;
    });
    if (relatedActions.length > 0) {
      meetingActionMap.set(mid, relatedActions);
    }
  }

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Total Meetings</div>
        <div class="card-value">${meetings.length}</div>
        <div class="card-sub">recorded</div>
      </div>
      <div class="card">
        <div class="card-label">With Actions</div>
        <div class="card-value">${meetingActionMap.size}</div>
        <div class="card-sub">meetings with linked actions</div>
      </div>
    </div>`;

  const meetingsTable = sortedMeetings.length > 0
    ? `<div class="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>ID</th><th>Title</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${sortedMeetings.map((m) => {
              const date = (m.frontmatter.date as string) ?? m.frontmatter.created;
              const relatedActions = meetingActionMap.get(m.frontmatter.id) ?? [];
              const openCount = relatedActions.filter((a) => !DONE_STATUSES.has(a.frontmatter.status)).length;
              return `
            <tr>
              <td>${formatDate(date)}</td>
              <td><a href="/docs/meeting/${escapeHtml(m.frontmatter.id)}">${escapeHtml(m.frontmatter.id)}</a></td>
              <td>${escapeHtml(m.frontmatter.title)}</td>
              <td>${relatedActions.length > 0 ? `${relatedActions.length} (${openCount} open)` : '<span class="text-dim">—</span>'}</td>
            </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`
    : '<div class="empty"><p>No meetings recorded.</p></div>';

  // Recent meeting action items
  const recentMeetingActions: Array<{ action: (typeof actions)[0]; meetingId: string }> = [];
  for (const [mid, acts] of meetingActionMap) {
    for (const act of acts) {
      if (!DONE_STATUSES.has(act.frontmatter.status)) {
        recentMeetingActions.push({ action: act, meetingId: mid });
      }
    }
  }
  recentMeetingActions.sort((a, b) => {
    const da = a.action.frontmatter.dueDate ?? a.action.frontmatter.created;
    const db = b.action.frontmatter.dueDate ?? b.action.frontmatter.created;
    return da.localeCompare(db);
  });

  const actionItemsSection = recentMeetingActions.length > 0
    ? collapsibleSection(
        "dm-meetings-actions",
        `Open Meeting Action Items (${recentMeetingActions.length})`,
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>Action ID</th><th>Title</th><th>Meeting</th><th>Owner</th><th>Due</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${recentMeetingActions.map(({ action: a, meetingId }) => `
              <tr>
                <td><a href="/docs/action/${escapeHtml(a.frontmatter.id)}">${escapeHtml(a.frontmatter.id)}</a></td>
                <td>${escapeHtml(a.frontmatter.title)}</td>
                <td><a href="/docs/meeting/${escapeHtml(meetingId)}">${escapeHtml(meetingId)}</a></td>
                <td>${a.frontmatter.owner ? escapeHtml(a.frontmatter.owner) : '<span class="text-dim">—</span>'}</td>
                <td>${a.frontmatter.dueDate ? formatDate(a.frontmatter.dueDate) : '<span class="text-dim">—</span>'}</td>
                <td>${statusBadge(a.frontmatter.status)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  return `
    <div class="page-header">
      <h2>Meetings</h2>
      <div class="subtitle">Meeting log and cross-referenced action items</div>
    </div>
    ${statsCards}
    ${collapsibleSection("dm-meetings-log", `Meeting Log (${sortedMeetings.length})`, meetingsTable, { titleTag: "h3" })}
    ${actionItemsSection}
  `;
}
