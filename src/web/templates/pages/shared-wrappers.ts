import type { PersonaPageContext } from "../../persona-views.js";
import {
  getDiagramData,
  getBoardData,
  getUpcomingData,
  getGarData,
  getSprintSummaryData,
} from "../../data.js";
import { collectHealthMetrics } from "../../../reports/health/collector.js";
import { evaluateHealth } from "../../../reports/health/evaluator.js";
import { timelinePage } from "./timeline.js";
import { boardPage } from "./board.js";
import { upcomingPage } from "./upcoming.js";
import { garPage } from "./gar.js";
import { healthPage } from "./health.js";
import { sprintSummaryPage } from "./sprint-summary.js";

export function sharedTimelinePage(ctx: PersonaPageContext): string {
  const diagrams = getDiagramData(ctx.store);
  return timelinePage(diagrams);
}

export function sharedBoardPage(ctx: PersonaPageContext): string {
  const type = ctx.subPath || undefined;
  const data = getBoardData(ctx.store, type);
  const basePath = ctx.persona ? `/${ctx.persona}/board` : "/board";
  return boardPage(data, basePath);
}

export function sharedUpcomingPage(ctx: PersonaPageContext): string {
  const data = getUpcomingData(ctx.store);
  return upcomingPage(data);
}

export function sharedGarPage(ctx: PersonaPageContext): string {
  const report = getGarData(ctx.store, ctx.projectName);
  return garPage(report);
}

export function sharedHealthPage(ctx: PersonaPageContext): string {
  const healthMetrics = collectHealthMetrics(ctx.store);
  const report = evaluateHealth(ctx.projectName, healthMetrics);
  return healthPage(report, healthMetrics);
}

export function sharedSprintSummaryPage(ctx: PersonaPageContext): string {
  const sprintId = ctx.searchParams?.get("sprint") ?? undefined;
  const data = getSprintSummaryData(ctx.store, sprintId);
  return sprintSummaryPage(data);
}
