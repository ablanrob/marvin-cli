import type { PersonaPageContext } from "../../../persona-views.js";
import { getUpcomingData } from "../../../data.js";
import { collectHealthMetrics } from "../../../../reports/health/collector.js";
import { evaluateHealth } from "../../../../reports/health/evaluator.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge, typeLabel } from "../../layout.js";

const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);

export function dmRisksPage(ctx: PersonaPageContext): string {
  const allDocs = ctx.store.list();
  const upcoming = getUpcomingData(ctx.store);
  const healthMetrics = collectHealthMetrics(ctx.store);
  const healthReport = evaluateHealth(ctx.projectName, healthMetrics);

  // Blocked items
  const blockedItems = allDocs.filter((d) => d.frontmatter.status === "blocked");

  // Aging items (>14 days open for actions and questions)
  const today = new Date().toISOString().slice(0, 10);
  const todayMs = new Date(today).getTime();
  const fourteenDaysMs = 14 * 86_400_000;

  const agingItems = allDocs.filter((d) => {
    if (DONE_STATUSES.has(d.frontmatter.status)) return false;
    if (!["action", "question"].includes(d.frontmatter.type)) return false;
    const createdMs = new Date(d.frontmatter.created).getTime();
    return todayMs - createdMs > fourteenDaysMs;
  });

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Blocked Items</div>
        <div class="card-value${blockedItems.length > 0 ? " priority-high" : ""}">${blockedItems.length}</div>
        <div class="card-sub">currently blocked</div>
      </div>
      <div class="card">
        <div class="card-label">Aging Items</div>
        <div class="card-value${agingItems.length > 0 ? " priority-medium" : ""}">${agingItems.length}</div>
        <div class="card-sub">&gt;14 days open</div>
      </div>
      <div class="card">
        <div class="card-label">Health</div>
        <div class="card-value"><span class="dot-${healthReport.overall}" style="display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:0.3rem;vertical-align:middle;"></span>${healthReport.overall}</div>
        <div class="card-sub">overall project health</div>
      </div>
      <div class="card">
        <div class="card-label">Overdue Actions</div>
        <div class="card-value${upcoming.dueSoonActions.filter((a) => a.urgency === "overdue").length > 0 ? " priority-high" : ""}">${upcoming.dueSoonActions.filter((a) => a.urgency === "overdue").length}</div>
        <div class="card-sub">past due date</div>
      </div>
    </div>`;

  // Blocked items table
  const blockedSection = blockedItems.length > 0
    ? collapsibleSection(
        "dm-risks-blocked",
        `Blocked Items (${blockedItems.length})`,
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Type</th><th>Owner</th><th>Created</th></tr>
            </thead>
            <tbody>
              ${blockedItems.map((d) => `
              <tr>
                <td><a href="/docs/${escapeHtml(d.frontmatter.type)}/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${escapeHtml(typeLabel(d.frontmatter.type))}</td>
                <td>${d.frontmatter.owner ? escapeHtml(d.frontmatter.owner) : '<span class="text-dim">—</span>'}</td>
                <td>${formatDate(d.frontmatter.created)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  // Aging items table
  const agingSection = agingItems.length > 0
    ? collapsibleSection(
        "dm-risks-aging",
        `Aging Items (${agingItems.length})`,
        `<div class="table-wrap table-short">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Type</th><th>Status</th><th>Created</th><th>Age</th></tr>
            </thead>
            <tbody>
              ${agingItems
                .map((d) => {
                  const ageDays = Math.floor((todayMs - new Date(d.frontmatter.created).getTime()) / 86_400_000);
                  return `
              <tr>
                <td><a href="/docs/${escapeHtml(d.frontmatter.type)}/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${escapeHtml(typeLabel(d.frontmatter.type))}</td>
                <td>${statusBadge(d.frontmatter.status)}</td>
                <td>${formatDate(d.frontmatter.created)}</td>
                <td><span class="${ageDays > 30 ? "priority-high" : "priority-medium"}">${ageDays}d</span></td>
              </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  // Health overview
  const allCategories = [...healthReport.completeness, ...healthReport.process];
  const nonGreenHealth = allCategories.filter((c) => c.status !== "green");
  const healthMetricTags = nonGreenHealth.length > 0
    ? nonGreenHealth.map((c) => `<span class="gar-metric">${escapeHtml(c.name)} (${c.status})</span>`).join("")
    : `<span class="gar-metric">All areas healthy</span>`;

  const healthSection = collapsibleSection(
    "dm-risks-health",
    "Health Overview",
    `<div class="gar-overall-compact">
      <div class="gar-overall-status">
        <div class="dot dot-${healthReport.overall}"></div>
        <div class="label">${escapeHtml(healthReport.overall.toUpperCase())}</div>
      </div>
      <div class="gar-overall-metrics">${healthMetricTags}</div>
    </div>
    <div class="gar-areas-3col">
      ${allCategories.map((cat) => `
      <div class="gar-area">
        <div class="area-header">
          <div class="area-dot dot-${cat.status}"></div>
          <div class="area-name">${escapeHtml(cat.name)}</div>
        </div>
        <div class="area-summary">${escapeHtml(cat.summary)}</div>
      </div>`).join("")}
    </div>`,
    { titleTag: "h3", defaultCollapsed: true },
  );

  return `
    <div class="page-header">
      <h2>Risk & Blockers</h2>
      <div class="subtitle">Identify and track project risks, blockers, and aging items</div>
    </div>
    ${statsCards}
    ${blockedSection}
    ${agingSection}
    ${healthSection}
  `;
}
