import type { SprintSummaryData } from "../../../reports/sprint-summary/types.js";
import type { DocumentStore } from "../../../storage/store.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge, typeLabel, renderMarkdown } from "../layout.js";

export function sprintBlockersPage(data: SprintSummaryData | null, store: DocumentStore): string {
  if (!data) {
    return `
      <div class="page-header">
        <h2>Sprint Blockers</h2>
        <div class="subtitle">Blocked items in the active sprint</div>
      </div>
      <div class="empty">
        <h3>No Active Sprint</h3>
        <p>No active sprint found.</p>
      </div>`;
  }

  const blockerDocs = data.blockers.map((b) => {
    const doc = store.get(b.id);
    return { ...b, doc };
  });

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Blocked Items</div>
        <div class="card-value${blockerDocs.length > 0 ? " priority-high" : ""}">${blockerDocs.length}</div>
        <div class="card-sub">in ${escapeHtml(data.sprint.id)}</div>
      </div>
    </div>`;

  const itemCards = blockerDocs.map((b) => {
    const doc = b.doc;
    const owner = doc?.frontmatter.owner;
    const assignee = doc?.frontmatter.assignee;
    const content = doc?.content?.trim();

    return `
      <div class="blocker-card">
        <div class="blocker-card-header">
          <a href="/docs/${escapeHtml(b.type)}/${escapeHtml(b.id)}">${escapeHtml(b.id)}</a>
          <span class="text-dim">${escapeHtml(typeLabel(b.type))}</span>
          ${statusBadge("blocked")}
        </div>
        <h4 class="blocker-card-title">${escapeHtml(b.title)}</h4>
        <div class="blocker-card-meta">
          ${owner ? `<span><strong>Owner:</strong> ${escapeHtml(owner)}</span>` : ""}
          ${assignee ? `<span><strong>Assignee:</strong> ${escapeHtml(assignee)}</span>` : ""}
          ${doc?.frontmatter.created ? `<span><strong>Created:</strong> ${formatDate(doc.frontmatter.created)}</span>` : ""}
        </div>
        ${content ? `<div class="blocker-card-content detail-content">${renderMarkdown(content)}</div>` : ""}
      </div>`;
  }).join("");

  const emptyMessage = blockerDocs.length === 0
    ? `<div class="empty"><h3>No Blockers</h3><p>No blocked items in this sprint.</p></div>`
    : "";

  return `
    <div class="page-header">
      <h2>Sprint Blockers</h2>
      <div class="subtitle">Blocked items in ${escapeHtml(data.sprint.id)} — ${escapeHtml(data.sprint.title)}</div>
    </div>
    ${statsCards}
    ${emptyMessage}
    ${itemCards}`;
}
