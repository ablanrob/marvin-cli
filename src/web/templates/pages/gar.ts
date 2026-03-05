import type { GarReport } from "../../../reports/gar/types.js";
import { collapsibleSection, escapeHtml } from "../layout.js";
import { renderGarWidget } from "../gar-widget.js";

export function garPage(report: GarReport): string {
  const areaCards = report.areas
    .map((area) => {
      const insights = (area.insights ?? []).length > 0
        ? `<ul class="gar-insights">${area.insights.map((ins) => `<li>${escapeHtml(ins)}</li>`).join("")}</ul>`
        : "";

      const itemList = area.items.length > 0
        ? collapsibleSection(
            `gar-items-${area.name.toLowerCase()}`,
            `Items (${area.items.length})`,
            `<ul>${area.items.map((item) => {
              const overdue = item.daysOverdue != null
                ? ` <span class="text-dim">(${item.daysOverdue}d overdue)</span>`
                : "";
              return `<li><span class="ref-id">${escapeHtml(item.id)}</span>${escapeHtml(item.title)}${overdue}</li>`;
            }).join("")}</ul>`,
            { titleTag: "div", titleClass: "section-title", defaultCollapsed: true },
          )
        : "";

      return `
      <div class="gar-area">
        <div class="area-header">
          <div class="area-dot dot-${area.status}"></div>
          <div class="area-name">${escapeHtml(area.name)}</div>
        </div>
        <div class="area-summary">${escapeHtml(area.summary)}</div>
        ${insights}
        ${itemList}
      </div>`;
    })
    .join("\n");

  return `
    <div class="page-header">
      <h2>GAR Report</h2>
      <div class="subtitle">Generated ${escapeHtml(report.generatedAt)}</div>
    </div>

    ${renderGarWidget(report)}

    <div class="gar-areas-3col">${areaCards}</div>
  `;
}
