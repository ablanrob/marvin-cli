import type { PersonaPageContext } from "../../../persona-views.js";
import { getSprintSummaryData, getDiagramData } from "../../../data.js";
import { buildArtifactFlowchart } from "../../mermaid.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge, typeLabel } from "../../layout.js";

const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);

export function tlDashboardPage(ctx: PersonaPageContext): string {
  const epics = ctx.store.list({ type: "epic" });
  const tasks = ctx.store.list({ type: "task" });
  const decisions = ctx.store.list({ type: "decision" });
  const questions = ctx.store.list({ type: "question" });
  const diagrams = getDiagramData(ctx.store);

  const openEpics = epics.filter((d) => !DONE_STATUSES.has(d.frontmatter.status));
  const openTasks = tasks.filter((d) => !DONE_STATUSES.has(d.frontmatter.status));

  // Technical decisions = decisions with tags containing "technical" or type hints
  const technicalDecisions = decisions.filter((d) => {
    const tags = (d.frontmatter.tags as string[]) ?? [];
    return tags.some((t) => t.toLowerCase().includes("technical") || t.toLowerCase().includes("architecture"));
  });
  const openTechDecisions = technicalDecisions.filter((d) => !DONE_STATUSES.has(d.frontmatter.status));

  // Fallback: show all open decisions if no technical tags found
  const pendingDecisions = openTechDecisions.length > 0
    ? openTechDecisions
    : decisions.filter((d) => !DONE_STATUSES.has(d.frontmatter.status));

  const statsCards = `
    <div class="cards">
      <div class="card">
        <a href="/tl/backlog">
          <div class="card-label">Open Epics</div>
          <div class="card-value">${openEpics.length}</div>
          <div class="card-sub">${epics.length} total</div>
        </a>
      </div>
      <div class="card">
        <a href="/tl/backlog">
          <div class="card-label">Open Tasks</div>
          <div class="card-value">${openTasks.length}</div>
          <div class="card-sub">${tasks.length} total</div>
        </a>
      </div>
      <div class="card">
        <a href="/tl/decisions">
          <div class="card-label">Pending Decisions</div>
          <div class="card-value${pendingDecisions.length > 0 ? " priority-medium" : ""}">${pendingDecisions.length}</div>
          <div class="card-sub">needing resolution</div>
        </a>
      </div>
      <div class="card">
        <a href="/tl/sprint">
          <div class="card-label">Blocked</div>
          <div class="card-value${tasks.filter((t) => t.frontmatter.status === "blocked").length > 0 ? " priority-high" : ""}">${tasks.filter((t) => t.frontmatter.status === "blocked").length}</div>
          <div class="card-sub">blocked tasks</div>
        </a>
      </div>
    </div>`;

  // Artifact relationship diagram
  const diagramSection = collapsibleSection(
    "tl-dash-diagram",
    "Architecture Relationships",
    buildArtifactFlowchart(diagrams),
    { titleTag: "h3" },
  );

  return `
    <div class="page-header">
      <h2>Technical Lead Dashboard</h2>
      <div class="subtitle">Technical backlog, architecture decisions, and sprint work</div>
    </div>
    ${statsCards}
    ${diagramSection}
  `;
}
