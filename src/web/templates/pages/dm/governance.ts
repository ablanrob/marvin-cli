import type { PersonaPageContext } from "../../../persona-views.js";
import { getGarData } from "../../../data.js";
import { collectHealthMetrics } from "../../../../reports/health/collector.js";
import { evaluateHealth } from "../../../../reports/health/evaluator.js";
import { garPage } from "../gar.js";
import { healthPage } from "../health.js";
import { collapsibleSection, escapeHtml } from "../../layout.js";

export function dmGovernancePage(ctx: PersonaPageContext): string {
  const garReport = getGarData(ctx.store, ctx.projectName);
  const healthMetrics = collectHealthMetrics(ctx.store);
  const healthReport = evaluateHealth(ctx.projectName, healthMetrics);

  // Render GAR content inline
  const garContent = garPage(garReport);
  const healthContent = healthPage(healthReport, healthMetrics);

  return `
    <div class="page-header">
      <h2>Governance</h2>
      <div class="subtitle">GAR report and health check combined view</div>
    </div>
    ${collapsibleSection("dm-gov-gar", "GAR Report", garContent, { titleTag: "h3" })}
    ${collapsibleSection("dm-gov-health", "Health Check", healthContent, { titleTag: "h3" })}
  `;
}
