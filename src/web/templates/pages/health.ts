import type { HealthReport } from "../../../reports/health/types.js";
import type { HealthMetrics } from "../../../reports/health/types.js";
import { collapsibleSection, escapeHtml } from "../layout.js";
import { buildHealthGauge, buildStatusPie } from "../mermaid.js";

export function healthPage(report: HealthReport, metrics?: HealthMetrics): string {
  const dotClass = `dot-${report.overall}`;

  function renderSection(
    sectionId: string,
    title: string,
    categories: HealthReport["completeness"],
  ): string {
    const cards = categories
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
              ? `<ul>${cat.items.map((item) => `<li><span class="ref-id">${escapeHtml(item.id)}</span>${escapeHtml(item.detail)}</li>`).join("")}</ul>`
              : ""
          }
        </div>`,
      )
      .join("\n");

    return collapsibleSection(sectionId, title, `<div class="gar-areas">${cards}</div>`, {
      titleClass: "health-section-title",
    });
  }

  return `
    <div class="page-header">
      <h2>Governance Health Check</h2>
      <div class="subtitle">Generated ${escapeHtml(report.generatedAt)}</div>
    </div>

    <div class="gar-overall">
      <div class="dot ${dotClass}"></div>
      <div class="label">Overall: ${escapeHtml(report.overall)}</div>
    </div>

    ${renderSection("health-completeness", "Completeness", report.completeness)}

    ${collapsibleSection(
      "health-completeness-overview",
      "Completeness Overview",
      buildHealthGauge(
        metrics
          ? Object.entries(metrics.completeness).map(([name, cat]) => ({
              name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
              complete: cat.complete,
              total: cat.total,
            }))
          : report.completeness.map((c) => {
              const match = c.summary.match(/(\d+)\s*\/\s*(\d+)/);
              return {
                name: c.name,
                complete: match ? parseInt(match[1], 10) : 0,
                total: match ? parseInt(match[2], 10) : 0,
              };
            }),
      ),
      { titleClass: "health-section-title" },
    )}

    ${renderSection("health-process", "Process", report.process)}

    ${collapsibleSection(
      "health-process-summary",
      "Process Summary",
      metrics ? buildStatusPie("Process Health", {
        Stale: metrics.process.stale.length,
        "Aging Actions": metrics.process.agingActions.length,
        Healthy: Math.max(0,
          (metrics.completeness ? Object.values(metrics.completeness).reduce((sum, c) => sum + c.total, 0) : 0)
          - metrics.process.stale.length - metrics.process.agingActions.length),
      }) : "",
      { titleClass: "health-section-title" },
    )}
  `;
}
