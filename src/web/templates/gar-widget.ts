import type { GarReport } from "../../reports/gar/types.js";
import { escapeHtml } from "./layout.js";

/**
 * Compact overall GAR status bar — reusable across pages.
 * Shows the status dot + label + key metric tags.
 */
export function renderGarWidget(report: GarReport): string {
  const dotClass = `dot-${report.overall}`;
  const m = report.metrics;

  const metrics = [
    m.scope.atRiskItems.length > 0 ? `${m.scope.atRiskItems.length} at-risk` : null,
    m.schedule.overdue > 0 ? `${m.schedule.overdue} overdue` : null,
    m.schedule.blocked > 0 ? `${m.schedule.blocked} blocked` : null,
    m.quality.riskCount > 0 ? `${m.quality.riskCount} risk(s)` : null,
    m.quality.openQuestions > 0 ? `${m.quality.openQuestions} open question(s)` : null,
  ].filter(Boolean);

  return `<div class="gar-overall-compact">
    <div class="gar-overall-status">
      <div class="dot ${dotClass}"></div>
      <div class="label">${escapeHtml(report.overall.toUpperCase())}</div>
    </div>
    ${
      metrics.length > 0
        ? `<div class="gar-overall-metrics">${metrics.map((m) => `<span class="gar-metric">${m}</span>`).join("")}</div>`
        : `<div class="gar-overall-metrics"><span class="gar-metric">No issues detected</span></div>`
    }
  </div>`;
}
