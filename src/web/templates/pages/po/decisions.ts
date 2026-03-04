import type { PersonaPageContext } from "../../../persona-views.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge } from "../../layout.js";

const DONE_STATUSES = new Set(["done", "closed", "resolved"]);

export function poDecisionsPage(ctx: PersonaPageContext): string {
  const decisions = ctx.store.list({ type: "decision" });

  const openDecisions = decisions.filter((d) => !DONE_STATUSES.has(d.frontmatter.status));
  const resolvedDecisions = decisions.filter((d) => DONE_STATUSES.has(d.frontmatter.status));

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Open</div>
        <div class="card-value${openDecisions.length > 0 ? " priority-medium" : ""}">${openDecisions.length}</div>
        <div class="card-sub">awaiting resolution</div>
      </div>
      <div class="card">
        <div class="card-label">Resolved</div>
        <div class="card-value">${resolvedDecisions.length}</div>
        <div class="card-sub">decisions made</div>
      </div>
      <div class="card">
        <div class="card-label">Total</div>
        <div class="card-value">${decisions.length}</div>
        <div class="card-sub">all decisions</div>
      </div>
    </div>`;

  function decisionTable(docs: typeof decisions): string {
    if (docs.length === 0) return '<div class="empty"><p>None found.</p></div>';
    return `<div class="table-wrap">
      <table>
        <thead>
          <tr><th>ID</th><th>Title</th><th>Status</th><th>Owner</th><th>Created</th></tr>
        </thead>
        <tbody>
          ${docs.map((d) => `
          <tr>
            <td><a href="/docs/decision/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
            <td>${escapeHtml(d.frontmatter.title)}</td>
            <td>${statusBadge(d.frontmatter.status)}</td>
            <td>${d.frontmatter.owner ? escapeHtml(d.frontmatter.owner) : '<span class="text-dim">—</span>'}</td>
            <td>${formatDate(d.frontmatter.created)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  }

  const openSection = collapsibleSection(
    "po-decisions-open",
    `Open Decisions (${openDecisions.length})`,
    decisionTable(openDecisions),
    { titleTag: "h3" },
  );

  const resolvedSection = collapsibleSection(
    "po-decisions-resolved",
    `Resolved Decisions (${resolvedDecisions.length})`,
    decisionTable(resolvedDecisions),
    { titleTag: "h3", defaultCollapsed: true },
  );

  return `
    <div class="page-header">
      <h2>Decision Log</h2>
      <div class="subtitle">Track and manage product decisions</div>
    </div>
    ${statsCards}
    ${openSection}
    ${resolvedSection}
  `;
}
