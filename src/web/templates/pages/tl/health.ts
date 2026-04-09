import type { PersonaPageContext } from "../../../persona-views.js";
import { getUpcomingData } from "../../../data.js";
import { collectHealthMetrics } from "../../../../reports/health/collector.js";
import { evaluateHealth } from "../../../../reports/health/evaluator.js";
import { collapsibleSection, escapeHtml, formatDate, ownerBadge, typeLabel } from "../../layout.js";
import { buildHealthGauge } from "../../mermaid.js";

export function tlHealthPage(ctx: PersonaPageContext): string {
  const healthMetrics = collectHealthMetrics(ctx.store);
  const healthReport = evaluateHealth(ctx.projectName, healthMetrics);
  const upcoming = getUpcomingData(ctx.store);

  // High-priority blocked tasks
  const tasks = ctx.store.list({ type: "task" });
  const blockedTasks = tasks.filter((t) => t.frontmatter.status === "blocked");
  const highPriorityBlocked = blockedTasks.filter((t) => {
    const p = (t.frontmatter.priority as string)?.toLowerCase();
    return p === "critical" || p === "high";
  });

  // Trending technical items
  const techTrending = upcoming.trending.filter((t) => ["task", "action"].includes(t.type));

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Health</div>
        <div class="card-value"><span class="dot-${healthReport.overall}" style="display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:0.3rem;vertical-align:middle;"></span>${healthReport.overall}</div>
        <div class="card-sub">overall project health</div>
      </div>
      <div class="card">
        <div class="card-label">Blocked Tasks</div>
        <div class="card-value${blockedTasks.length > 0 ? " priority-high" : ""}">${blockedTasks.length}</div>
        <div class="card-sub">${highPriorityBlocked.length} high priority</div>
      </div>
      <div class="card">
        <div class="card-label">Completeness</div>
        <div class="card-value">${healthReport.completeness.filter((c) => c.status === "green").length}/${healthReport.completeness.length}</div>
        <div class="card-sub">categories green</div>
      </div>
      <div class="card">
        <div class="card-label">Process</div>
        <div class="card-value">${healthReport.process.filter((c) => c.status === "green").length}/${healthReport.process.length}</div>
        <div class="card-sub">metrics green</div>
      </div>
    </div>`;

  // Completeness gauge
  const gaugeData = Object.entries(healthMetrics.completeness).map(([name, cat]) => ({
    name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
    complete: cat.complete,
    total: cat.total,
  }));
  const gaugeSection = collapsibleSection(
    "tl-health-gauge",
    "Completeness Overview",
    buildHealthGauge(gaugeData),
    { titleTag: "h3" },
  );

  // Process health cards
  const processSection = collapsibleSection(
    "tl-health-process",
    "Process Health",
    `<div class="gar-areas">
      ${healthReport.process
        .map(
          (cat) => `
      <div class="gar-area">
        <div class="area-header">
          <div class="area-dot dot-${cat.status}"></div>
          <div class="area-name">${escapeHtml(cat.name)}</div>
        </div>
        <div class="area-summary">${escapeHtml(cat.summary)}</div>
        ${
          cat.items.length > 0
            ? `<ul>${cat.items
                .slice(0, 5)
                .map(
                  (item) =>
                    `<li><span class="ref-id">${escapeHtml(item.id)}</span>${escapeHtml(item.detail)}</li>`,
                )
                .join("")}</ul>`
            : ""
        }
      </div>`,
        )
        .join("")}
    </div>`,
    { titleTag: "h3" },
  );

  // Blocked tasks table
  const blockedSection =
    blockedTasks.length > 0
      ? collapsibleSection(
          "tl-health-blocked",
          `Blocked Tasks (${blockedTasks.length})`,
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Priority</th><th>Owner</th><th>Created</th></tr>
            </thead>
            <tbody>
              ${blockedTasks
                .map(
                  (t) => `
              <tr>
                <td><a href="/docs/task/${escapeHtml(t.frontmatter.id)}">${escapeHtml(t.frontmatter.id)}</a></td>
                <td>${escapeHtml(t.frontmatter.title)}</td>
                <td>${t.frontmatter.priority ? `<span class="${priorityClass(t.frontmatter.priority as string)}">${escapeHtml(t.frontmatter.priority as string)}</span>` : '<span class="text-dim">—</span>'}</td>
                <td>${ownerBadge(t.frontmatter.owner)}</td>
                <td>${formatDate(t.frontmatter.created)}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3" },
        )
      : "";

  // Trending technical items
  const trendingSection =
    techTrending.length > 0
      ? collapsibleSection(
          "tl-health-trending",
          "Trending Technical Items",
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Type</th><th>Score</th><th>Signals</th></tr>
            </thead>
            <tbody>
              ${techTrending
                .slice(0, 10)
                .map(
                  (t) => `
              <tr>
                <td><a href="/docs/${escapeHtml(t.type)}/${escapeHtml(t.id)}">${escapeHtml(t.id)}</a></td>
                <td>${escapeHtml(t.title)}</td>
                <td>${escapeHtml(typeLabel(t.type))}</td>
                <td><span class="trending-score">${t.score}</span></td>
                <td>${t.signals.map((s) => `<span class="signal-tag">${escapeHtml(s.factor)} +${s.points}</span>`).join(" ")}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3", defaultCollapsed: true },
        )
      : "";

  return `
    <div class="page-header">
      <h2>Technical Health</h2>
      <div class="subtitle">Project health, completeness metrics, and blocked items</div>
    </div>
    ${statsCards}
    ${gaugeSection}
    ${processSection}
    ${blockedSection}
    ${trendingSection}
  `;
}

function priorityClass(p: string): string {
  const lower = p.toLowerCase();
  if (lower === "critical" || lower === "high") return "priority-high";
  if (lower === "medium") return "priority-medium";
  if (lower === "low") return "priority-low";
  return "";
}
