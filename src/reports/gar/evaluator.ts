import type { GarArea, GarMetrics, GarReport, GarStatus } from "./types.js";

function worstStatus(statuses: GarStatus[]): GarStatus {
  if (statuses.includes("red")) return "red";
  if (statuses.includes("amber")) return "amber";
  return "green";
}

export function evaluateGar(
  projectName: string,
  metrics: GarMetrics,
): GarReport {
  const areas: GarArea[] = [];

  // Scope
  const scopePct = metrics.scope.completionPct;
  const scopeStatus: GarStatus =
    scopePct >= 70 ? "green" : scopePct >= 40 ? "amber" : "red";
  areas.push({
    name: "Scope",
    status: scopeStatus,
    summary: `${scopePct}% complete (${metrics.scope.done}/${metrics.scope.total})`,
    items: [],
  });

  // Schedule
  const scheduleCount = metrics.schedule.blocked + metrics.schedule.overdue;
  const scheduleStatus: GarStatus =
    scheduleCount === 0 ? "green" : scheduleCount <= 2 ? "amber" : "red";
  const scheduleParts: string[] = [];
  if (metrics.schedule.blocked > 0)
    scheduleParts.push(`${metrics.schedule.blocked} blocked`);
  if (metrics.schedule.overdue > 0)
    scheduleParts.push(`${metrics.schedule.overdue} overdue`);
  areas.push({
    name: "Schedule",
    status: scheduleStatus,
    summary: scheduleParts.length > 0 ? scheduleParts.join(", ") : "on track",
    items: metrics.schedule.items,
  });

  // Quality
  const qualityCount = metrics.quality.risks + metrics.quality.openQuestions;
  const qualityStatus: GarStatus =
    qualityCount === 0 ? "green" : qualityCount <= 2 ? "amber" : "red";
  const qualityParts: string[] = [];
  if (metrics.quality.risks > 0)
    qualityParts.push(`${metrics.quality.risks} risk(s)`);
  if (metrics.quality.openQuestions > 0)
    qualityParts.push(`${metrics.quality.openQuestions} open question(s)`);
  areas.push({
    name: "Quality",
    status: qualityStatus,
    summary: qualityParts.length > 0 ? qualityParts.join(", ") : "no issues",
    items: metrics.quality.items,
  });

  // Resources
  const resourceCount = metrics.resources.unowned;
  const resourceStatus: GarStatus =
    resourceCount === 0 ? "green" : resourceCount <= 2 ? "amber" : "red";
  areas.push({
    name: "Resources",
    status: resourceStatus,
    summary:
      resourceCount > 0
        ? `${resourceCount} unowned action(s)`
        : "all assigned",
    items: metrics.resources.items,
  });

  const overall = worstStatus(areas.map((a) => a.status));

  return {
    projectName,
    generatedAt: new Date().toISOString().slice(0, 10),
    overall,
    areas,
    metrics,
  };
}
