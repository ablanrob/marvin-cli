import type { PersonaPageContext } from "../../../persona-views.js";
import { getGarData, getUpcomingData } from "../../../data.js";
import { garPage } from "../gar.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge } from "../../layout.js";

export function poStakeholdersPage(ctx: PersonaPageContext): string {
  const garReport = getGarData(ctx.store, ctx.projectName);
  const upcoming = getUpcomingData(ctx.store);

  // Open action items
  const actions = ctx.store.list({ type: "action" });
  const openActions = actions.filter(
    (d) => !["done", "closed", "resolved", "cancelled"].includes(d.frontmatter.status),
  );

  // Questions needing input
  const questions = ctx.store.list({ type: "question" });
  const openQuestions = questions.filter((d) => d.frontmatter.status === "open");

  // GAR summary section (reuse the gar page rendering as a section)
  const garDotClass = `dot-${garReport.overall}`;
  const garAreaCards = garReport.areas
    .map(
      (area) => `
      <div class="gar-area">
        <div class="area-header">
          <div class="area-dot dot-${area.status}"></div>
          <div class="area-name">${escapeHtml(area.name)}</div>
        </div>
        <div class="area-summary">${escapeHtml(area.summary)}</div>
        ${
          area.items.length > 0
            ? `<ul>${area.items.slice(0, 5).map((item) => `<li><span class="ref-id">${escapeHtml(item.id)}</span>${escapeHtml(item.title)}</li>`).join("")}</ul>`
            : ""
        }
      </div>`,
    )
    .join("\n");

  const garSection = collapsibleSection(
    "po-stakeholders-gar",
    "Project Status (GAR)",
    `<div class="gar-overall">
      <div class="dot ${garDotClass}"></div>
      <div class="label">Overall: ${escapeHtml(garReport.overall)}</div>
    </div>
    <div class="gar-areas">${garAreaCards}</div>`,
    { titleTag: "h3" },
  );

  // Open actions table
  const actionsSection = openActions.length > 0
    ? collapsibleSection(
        "po-stakeholders-actions",
        `Open Action Items (${openActions.length})`,
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Status</th><th>Owner</th><th>Due Date</th></tr>
            </thead>
            <tbody>
              ${openActions.map((d) => `
              <tr>
                <td><a href="/docs/action/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${statusBadge(d.frontmatter.status)}</td>
                <td>${d.frontmatter.owner ? escapeHtml(d.frontmatter.owner) : '<span class="text-dim">—</span>'}</td>
                <td>${d.frontmatter.dueDate ? formatDate(d.frontmatter.dueDate) : '<span class="text-dim">—</span>'}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  // Questions needing input
  const questionsSection = openQuestions.length > 0
    ? collapsibleSection(
        "po-stakeholders-questions",
        `Questions Needing Input (${openQuestions.length})`,
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Owner</th><th>Created</th></tr>
            </thead>
            <tbody>
              ${openQuestions.map((d) => `
              <tr>
                <td><a href="/docs/question/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${d.frontmatter.owner ? escapeHtml(d.frontmatter.owner) : '<span class="text-dim">—</span>'}</td>
                <td>${formatDate(d.frontmatter.created)}</td>
              </tr>`).join("")}
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
  `;
}
