import type { PersonaPageContext } from "../../../persona-views.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge } from "../../layout.js";
import { renderTableUtilsScript, sortableTh, tableFilter, tableDateFilter } from "../../table-utils.js";

/** Decision statuses that indicate the decision has been resolved */
const RESOLVED_STATUSES = new Set(["decided", "superseded", "dismissed"]);

export function poDecisionsPage(ctx: PersonaPageContext): string {
  const decisions = ctx.store.list({ type: "decision" });

  const openDecisions = decisions.filter((d) => !RESOLVED_STATUSES.has(d.frontmatter.status));
  const resolvedDecisions = decisions.filter((d) => RESOLVED_STATUSES.has(d.frontmatter.status));

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

  function decisionTable(docs: typeof decisions, tableId: string): string {
    if (docs.length === 0) return '<div class="empty"><p>None found.</p></div>';

    const statuses = [...new Set(docs.map((d) => d.frontmatter.status))].sort();
    const owners = [...new Set(docs.map((d) => d.frontmatter.owner).filter(Boolean) as string[])].sort();

    const filters = `<div class="filters">
      ${tableFilter(tableId, 2, "Status", statuses)}
      ${owners.length > 0 ? tableFilter(tableId, 3, "Owner", owners) : ""}
      ${tableDateFilter(tableId, 4)}
    </div>`;

    return `${filters}
    <div class="table-wrap table-short">
      <table id="${escapeHtml(tableId)}">
        <thead>
          <tr>${sortableTh("ID", tableId, 0)}${sortableTh("Title", tableId, 1)}${sortableTh("Status", tableId, 2)}${sortableTh("Owner", tableId, 3)}${sortableTh("Created", tableId, 4)}</tr>
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
    decisionTable(openDecisions, "decisions-open-table"),
    { titleTag: "h3" },
  );

  const resolvedSection = collapsibleSection(
    "po-decisions-resolved",
    `Resolved Decisions (${resolvedDecisions.length})`,
    decisionTable(resolvedDecisions, "decisions-resolved-table"),
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
    ${renderTableUtilsScript()}
  `;
}
