import type { PersonaPageContext } from "../../../persona-views.js";
import { getDiagramData } from "../../../data.js";
import { buildArtifactFlowchart } from "../../mermaid.js";
import { collapsibleSection } from "../../layout.js";
import { DONE_STATUSES } from "../../../../core/statuses.js";
/** Decision statuses that indicate the decision has been resolved */
const RESOLVED_DECISION_STATUSES = new Set(["decided", "superseded", "dismissed"]);

export function tlDashboardPage(ctx: PersonaPageContext): string {
  const epics = ctx.store.list({ type: "epic" });
  const tasks = ctx.store.list({ type: "task" });
  const decisions = ctx.store.list({ type: "decision" });
  const _questions = ctx.store.list({ type: "question" });
  const diagrams = getDiagramData(ctx.store);

  const openEpics = epics.filter((d) => !DONE_STATUSES.has(d.frontmatter.status));
  const openTasks = tasks.filter((d) => !DONE_STATUSES.has(d.frontmatter.status));

  // Technical decisions = decisions with tags containing technical/architecture/design
  const technicalDecisions = decisions.filter((d) => {
    const tags = (d.frontmatter.tags as string[]) ?? [];
    return tags.some((t) => {
      const lower = t.toLowerCase();
      return (
        lower.includes("technical") || lower.includes("architecture") || lower.includes("design")
      );
    });
  });

  // Fallback: show all decisions if no technical-tagged decisions exist at all
  const displayDecisions = technicalDecisions.length > 0 ? technicalDecisions : decisions;
  const pendingDecisions = displayDecisions.filter(
    (d) => !RESOLVED_DECISION_STATUSES.has(d.frontmatter.status),
  );

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
