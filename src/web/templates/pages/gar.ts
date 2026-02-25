import type { GarReport } from "../../../reports/gar/types.js";
import { escapeHtml } from "../layout.js";

export function garPage(report: GarReport): string {
  const dotClass = `dot-${report.overall}`;

  const areaCards = report.areas
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
            ? `<ul>${area.items.map((item) => `<li><span class="ref-id">${escapeHtml(item.id)}</span>${escapeHtml(item.title)}</li>`).join("")}</ul>`
            : ""
        }
      </div>`,
    )
    .join("\n");

  return `
    <div class="page-header">
      <h2>GAR Report</h2>
      <div class="subtitle">Generated ${escapeHtml(report.generatedAt)}</div>
    </div>

    <div class="gar-overall">
      <div class="dot ${dotClass}"></div>
      <div class="label">Overall: ${escapeHtml(report.overall)}</div>
    </div>

    <div class="gar-areas">
      ${areaCards}
    </div>
  `;
}
