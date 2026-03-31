import type { PersonaPageContext } from "../../../persona-views.js";
import { getGarData } from "../../../data.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge } from "../../layout.js";
import { renderGarWidget } from "../../gar-widget.js";
import { renderTableUtilsScript, sortableTh, tableFilter } from "../../table-utils.js";

const KNOWN_OWNERS = new Set(["po", "tl", "dm"]);

function ownerBadge(owner?: string): string {
  if (!owner) return '<span class="text-dim">—</span>';
  const cls = KNOWN_OWNERS.has(owner.toLowerCase())
    ? `owner-badge-${owner.toLowerCase()}`
    : "owner-badge-other";
  return `<span class="owner-badge ${cls}">${escapeHtml(owner.toUpperCase())}</span>`;
}

export function poStakeholdersPage(ctx: PersonaPageContext): string {
  const garReport = getGarData(ctx.store, ctx.projectName);

  // Open action items
  const actions = ctx.store.list({ type: "action" });
  const openActions = actions.filter(
    (d) => !["done", "closed", "resolved", "cancelled"].includes(d.frontmatter.status),
  );

  // Questions needing input
  const questions = ctx.store.list({ type: "question" });
  const openQuestions = questions.filter((d) => d.frontmatter.status === "open");

  // GAR summary section
  const garAreaCards = garReport.areas
    .map((area) => {
      const insights =
        (area.insights ?? []).length > 0
          ? `<ul class="gar-insights">${area.insights.map((ins) => `<li>${escapeHtml(ins)}</li>`).join("")}</ul>`
          : "";
      return `
      <div class="gar-area">
        <div class="area-header">
          <div class="area-dot dot-${area.status}"></div>
          <div class="area-name">${escapeHtml(area.name)}</div>
        </div>
        <div class="area-summary">${escapeHtml(area.summary)}</div>
        ${insights}
        ${
          area.items.length > 0
            ? `<ul>${area.items
                .slice(0, 5)
                .map(
                  (item) =>
                    `<li><span class="ref-id">${escapeHtml(item.id)}</span>${escapeHtml(item.title)}</li>`,
                )
                .join("")}</ul>`
            : ""
        }
      </div>`;
    })
    .join("\n");

  const garSection = collapsibleSection(
    "po-stakeholders-gar",
    "Project Status (GAR)",
    `${renderGarWidget(garReport)}
    <div class="gar-areas-3col">${garAreaCards}</div>`,
    { titleTag: "h3" },
  );

  // Open actions table with filters
  const actionStatuses = [...new Set(openActions.map((d) => d.frontmatter.status))].sort();
  const actionOwners = [
    ...new Set(openActions.map((d) => d.frontmatter.owner).filter(Boolean) as string[]),
  ].sort();

  const actionsSection =
    openActions.length > 0
      ? collapsibleSection(
          "po-stakeholders-actions",
          `Open Action Items (${openActions.length})`,
          `<div class="filters">
          ${tableFilter("stakeholder-actions-table", 2, "Status", actionStatuses)}
          ${actionOwners.length > 0 ? tableFilter("stakeholder-actions-table", 3, "Owner", actionOwners) : ""}
        </div>
        <div class="table-wrap table-short">
          <table id="stakeholder-actions-table">
            <thead>
              <tr>${sortableTh("ID", "stakeholder-actions-table", 0)}${sortableTh("Title", "stakeholder-actions-table", 1)}${sortableTh("Status", "stakeholder-actions-table", 2)}${sortableTh("Owner", "stakeholder-actions-table", 3)}${sortableTh("Due Date", "stakeholder-actions-table", 4)}</tr>
            </thead>
            <tbody>
              ${openActions
                .map(
                  (d) => `
              <tr>
                <td><a href="/docs/action/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${statusBadge(d.frontmatter.status)}</td>
                <td>${ownerBadge(d.frontmatter.owner)}</td>
                <td>${d.frontmatter.dueDate ? formatDate(d.frontmatter.dueDate) : '<span class="text-dim">—</span>'}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3" },
        )
      : "";

  // Questions needing input with filter
  const questionOwners = [
    ...new Set(openQuestions.map((d) => d.frontmatter.owner).filter(Boolean) as string[]),
  ].sort();

  const questionsSection =
    openQuestions.length > 0
      ? collapsibleSection(
          "po-stakeholders-questions",
          `Questions Needing Input (${openQuestions.length})`,
          `${questionOwners.length > 0 ? `<div class="filters">${tableFilter("stakeholder-questions-table", 2, "Owner", questionOwners)}</div>` : ""}
        <div class="table-wrap table-short">
          <table id="stakeholder-questions-table">
            <thead>
              <tr>${sortableTh("ID", "stakeholder-questions-table", 0)}${sortableTh("Title", "stakeholder-questions-table", 1)}${sortableTh("Owner", "stakeholder-questions-table", 2)}${sortableTh("Created", "stakeholder-questions-table", 3)}</tr>
            </thead>
            <tbody>
              ${openQuestions
                .map(
                  (d) => `
              <tr>
                <td><a href="/docs/question/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${ownerBadge(d.frontmatter.owner)}</td>
                <td>${formatDate(d.frontmatter.created)}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3" },
        )
      : "";

  return `
    <div class="page-header">
      <h2>Stakeholder View</h2>
      <div class="subtitle">Project status overview for stakeholder communication</div>
    </div>
    ${garSection}
    ${actionsSection}
    ${questionsSection}
    ${renderTableUtilsScript()}
  `;
}
