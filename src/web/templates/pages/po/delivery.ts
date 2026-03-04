import type { PersonaPageContext } from "../../../persona-views.js";
import type { SprintWorkItem } from "../../../../reports/sprint-summary/types.js";
import { getSprintSummaryData } from "../../../data.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge, typeLabel } from "../../layout.js";

const PO_CONTRIBUTION_TYPES = new Set([
  "stakeholder-feedback",
  "acceptance-result",
  "priority-change",
  "market-insight",
]);

function progressBar(pct: number): string {
  return `<div class="sprint-progress-bar">
    <div class="sprint-progress-fill" style="width: ${pct}%"></div>
    <span class="sprint-progress-label">${pct}%</span>
  </div>`;
}

export function poDeliveryPage(ctx: PersonaPageContext): string {
  const data = getSprintSummaryData(ctx.store);

  if (!data) {
    return `
      <div class="page-header">
        <h2>Value Delivery</h2>
        <div class="subtitle">Sprint progress and PO contributions</div>
      </div>
      <div class="empty">
        <h3>No Active Sprint</h3>
        <p>No active sprint found. Create a sprint and set its status to "active" to track delivery.</p>
      </div>`;
  }

  // Features completed this sprint
  const doneFeatures = data.workItems.items.filter(
    (w) => w.type === "feature" && ["done", "closed", "resolved"].includes(w.status),
  );

  // PO contributions from work items (recursively find contributions)
  interface Contribution {
    id: string;
    title: string;
    type: string;
    status: string;
    parentId?: string;
  }

  function findContributions(
    items: SprintWorkItem[],
    parentId?: string,
  ): Contribution[] {
    const result: Contribution[] = [];
    for (const item of items) {
      if (item.type === "contribution" && PO_CONTRIBUTION_TYPES.has(item.id.split("-").slice(0, -1).join("-") || "")) {
        result.push({ id: item.id, title: item.title, type: item.type, status: item.status, parentId });
      }
      // Check by contribution type pattern in ID or tags
      if (PO_CONTRIBUTION_TYPES.has(item.type)) {
        result.push({ id: item.id, title: item.title, type: item.type, status: item.status, parentId });
      }
      if (item.children) {
        result.push(...findContributions(item.children, item.id));
      }
    }
    return result;
  }

  // Find PO-relevant contributions from store directly
  const allDocs = ctx.store.list();
  const poContributions = allDocs.filter((d) => PO_CONTRIBUTION_TYPES.has(d.frontmatter.type));

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Sprint Progress</div>
        <div class="card-value">${data.workItems.completionPct}%</div>
        <div class="card-sub">${data.workItems.done} / ${data.workItems.total} items done</div>
      </div>
      <div class="card">
        <div class="card-label">Days Remaining</div>
        <div class="card-value">${data.timeline.daysRemaining}</div>
        <div class="card-sub">${data.timeline.daysElapsed} of ${data.timeline.totalDays} elapsed</div>
      </div>
      <div class="card">
        <div class="card-label">Features Done</div>
        <div class="card-value">${doneFeatures.length}</div>
        <div class="card-sub">this sprint</div>
      </div>
      <div class="card">
        <div class="card-label">PO Contributions</div>
        <div class="card-value">${poContributions.length}</div>
        <div class="card-sub">feedback, reviews, insights</div>
      </div>
    </div>`;

  const sprintHeader = `
    <div class="sprint-goal">
      <strong>${escapeHtml(data.sprint.id)} — ${escapeHtml(data.sprint.title)}</strong>
      ${data.sprint.goal ? ` | ${escapeHtml(data.sprint.goal)}` : ""}
    </div>`;

  // Features table
  const featuresSection = data.linkedEpics.length > 0
    ? collapsibleSection(
        "po-delivery-epics",
        "Linked Epics",
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Status</th><th>Tasks Done</th></tr>
            </thead>
            <tbody>
              ${data.linkedEpics.map((e) => `
              <tr>
                <td><a href="/docs/epic/${escapeHtml(e.id)}">${escapeHtml(e.id)}</a></td>
                <td>${escapeHtml(e.title)}</td>
                <td>${statusBadge(e.status)}</td>
                <td>${e.tasksDone} / ${e.tasksTotal}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  // PO contributions table
  const contributionsSection = poContributions.length > 0
    ? collapsibleSection(
        "po-delivery-contributions",
        `PO Contributions (${poContributions.length})`,
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Type</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              ${poContributions.map((d) => `
              <tr>
                <td><a href="/docs/${escapeHtml(d.frontmatter.type)}/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
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

  return `
    <div class="page-header">
      <h2>Value Delivery</h2>
      <div class="subtitle">Sprint progress and feature delivery tracking</div>
    </div>
    ${sprintHeader}
    ${progressBar(data.workItems.completionPct)}
    ${statsCards}
    ${featuresSection}
    ${contributionsSection}
  `;
}
