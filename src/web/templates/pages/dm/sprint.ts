import type { PersonaPageContext } from "../../../persona-views.js";
import { getSprintSummaryData } from "../../../data.js";
import { sprintSummaryPage } from "../sprint-summary.js";

export function dmSprintPage(ctx: PersonaPageContext): string {
  // Reuse the existing sprint summary page content
  const data = getSprintSummaryData(ctx.store);
  return sprintSummaryPage(data);
}
