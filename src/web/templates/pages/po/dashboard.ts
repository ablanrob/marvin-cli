import type { PersonaPageContext } from "../../../persona-views.js";
import { getOverviewData, getUpcomingData, getSprintSummaryData, getDiagramData } from "../../../data.js";
import { buildArtifactFlowchart } from "../../mermaid.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge, typeLabel } from "../../layout.js";

export function poDashboardPage(ctx: PersonaPageContext): string {
  const overview = getOverviewData(ctx.store);
  const upcoming = getUpcomingData(ctx.store);
  const sprintData = getSprintSummaryData(ctx.store);
  const diagrams = getDiagramData(ctx.store);

  // Feature stats
  const features = ctx.store.list({ type: "feature" });
  const featuresDone = features.filter((d) => ["done", "closed", "resolved"].includes(d.frontmatter.status)).length;
  const featuresOpen = features.filter((d) => d.frontmatter.status === "open").length;
  const featuresInProgress = features.filter((d) => d.frontmatter.status === "in-progress").length;

  // Decisions — anything not resolved is considered pending
  const RESOLVED_DECISION_STATUSES = new Set(["decided", "superseded", "dismissed"]);
  const decisions = ctx.store.list({ type: "decision" });
  const decisionsOpen = decisions.filter((d) => !RESOLVED_DECISION_STATUSES.has(d.frontmatter.status)).length;

  // Questions
  const questions = ctx.store.list({ type: "question" });
  const questionsOpen = questions.filter((d) => d.frontmatter.status === "open").length;

  const statsCards = `
    <div class="cards">
      <div class="card">
        <a href="/po/backlog">
          <div class="card-label">Features</div>
          <div class="card-value">${features.length}</div>
          <div class="card-sub">${featuresDone} done, ${featuresInProgress} in progress, ${featuresOpen} open</div>
        </a>
      </div>
      <div class="card">
        <a href="/po/decisions">
          <div class="card-label">Pending Decisions</div>
          <div class="card-value${decisionsOpen > 0 ? " priority-medium" : ""}">${decisionsOpen}</div>
          <div class="card-sub">${decisions.length} total decisions</div>
        </a>
      </div>
      <div class="card">
        <a href="/po/backlog">
          <div class="card-label">Open Questions</div>
          <div class="card-value${questionsOpen > 0 ? " priority-medium" : ""}">${questionsOpen}</div>
          <div class="card-sub">${questions.length} total questions</div>
        </a>
      </div>
      <div class="card">
        <a href="/po/delivery">
          <div class="card-label">Sprint</div>
          <div class="card-value">${sprintData ? `${sprintData.workItems.completionPct}%` : "—"}</div>
          <div class="card-sub">${sprintData ? `${sprintData.workItems.done}/${sprintData.workItems.total} items` : "No active sprint"}</div>
        </a>
      </div>
    </div>`;

  // Product hierarchy diagram (features → epics → sprints)
  const diagramSection = collapsibleSection(
    "po-dash-diagram",
    "Product Hierarchy",
    buildArtifactFlowchart(diagrams),
    { titleTag: "h3" },
  );

  // Recent PO-relevant activity (features, decisions, questions)
  const poTypes = new Set(["feature", "decision", "question"]);
  const poRecent = overview.recent
    .filter((d) => poTypes.has(d.frontmatter.type))
    .slice(0, 10);

  const recentTable = poRecent.length > 0
    ? collapsibleSection(
        "po-recent",
        "Recent Activity",
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Type</th><th>Status</th><th>Updated</th></tr>
            </thead>
            <tbody>
              ${poRecent.map((d) => `
              <tr>
                <td><a href="/docs/${d.frontmatter.type}/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${escapeHtml(typeLabel(d.frontmatter.type))}</td>
                <td>${statusBadge(d.frontmatter.status)}</td>
                <td>${formatDate(d.frontmatter.updated ?? d.frontmatter.created)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  // Trending items relevant to PO
  function signalTagClass(points: number): string {
    if (points >= 15) return "signal-tag signal-tag-high";
    if (points >= 8) return "signal-tag signal-tag-medium";
    return "signal-tag signal-tag-positive";
  }

  const trendingSection = upcoming.trending.length > 0
    ? collapsibleSection(
        "po-trending",
        "Trending Items",
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Score</th></tr>
            </thead>
            <tbody>
              ${upcoming.trending.slice(0, 8).map((t) => {
                const tags = t.signals
                  .map((s) => `<span class="${signalTagClass(s.points)}" title="${escapeHtml(s.factor)}: +${s.points}pts">${escapeHtml(s.factor)}</span>`)
                  .join("");
                return `
              <tr>
                <td><a href="/docs/${escapeHtml(t.type)}/${escapeHtml(t.id)}">${escapeHtml(t.id)}</a></td>
                <td>${escapeHtml(t.title)}<br>${tags}</td>
                <td><span class="trending-score">${t.score}</span></td>
              </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  return `
    <div class="page-header">
      <h2>Product Owner Dashboard</h2>
      <div class="subtitle">Feature delivery, decisions, and stakeholder alignment</div>
    </div>
    ${statsCards}
    ${diagramSection}
    ${recentTable}
    ${trendingSection}
  `;
}
