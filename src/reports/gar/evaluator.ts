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

  // Scope — urgency-aware
  const atRisk = metrics.scope.atRiskItems;
  const critHighAtRisk = atRisk.filter(
    (item) => {
      const p = (item.priority ?? "").toLowerCase();
      return p === "critical" || p === "high";
    },
  );
  const scopeStatus: GarStatus =
    critHighAtRisk.length > 0 ? "red" : atRisk.length > 0 ? "amber" : "green";

  const scopeInsights: string[] = [];
  if (critHighAtRisk.length > 0) {
    scopeInsights.push(`${critHighAtRisk.length} high-priority item(s) at risk`);
  }
  if (atRisk.length > critHighAtRisk.length) {
    scopeInsights.push(`${atRisk.length - critHighAtRisk.length} additional item(s) approaching deadlines`);
  }
  if (atRisk.length === 0) {
    scopeInsights.push("No at-risk items in active sprints");
  }

  areas.push({
    name: "Scope",
    status: scopeStatus,
    summary:
      atRisk.length > 0
        ? `${atRisk.length} at-risk item(s)`
        : "on track",
    items: atRisk,
    insights: scopeInsights,
  });

  // Schedule — enriched
  const scheduleStatus: GarStatus =
    metrics.schedule.badlyOverdueCount > 0
      ? "red"
      : metrics.schedule.blocked + metrics.schedule.overdue > 0
        ? "amber"
        : "green";

  const scheduleParts: string[] = [];
  if (metrics.schedule.blocked > 0)
    scheduleParts.push(`${metrics.schedule.blocked} blocked`);
  if (metrics.schedule.overdue > 0)
    scheduleParts.push(`${metrics.schedule.overdue} overdue`);

  const scheduleInsights: string[] = [];
  if (metrics.schedule.badlyOverdueCount > 0) {
    scheduleInsights.push(`${metrics.schedule.badlyOverdueCount} item(s) overdue by more than a week`);
  }
  if (metrics.schedule.blocked > 0) {
    scheduleInsights.push(`${metrics.schedule.blocked} item(s) blocked`);
  }

  areas.push({
    name: "Schedule",
    status: scheduleStatus,
    summary: scheduleParts.length > 0 ? scheduleParts.join(", ") : "on track",
    items: metrics.schedule.items,
    insights: scheduleInsights,
  });

  // Quality — weighted
  const qualityScore = metrics.quality.riskScore + metrics.quality.staleQuestionCount;
  const threshold = Math.max(5, Math.round(metrics.quality.totalOpenItems * 0.1));
  const qualityStatus: GarStatus =
    qualityScore > threshold ? "red" : qualityScore > 0 ? "amber" : "green";

  const qualityParts: string[] = [];
  if (metrics.quality.riskCount > 0)
    qualityParts.push(`${metrics.quality.riskCount} risk(s)`);
  if (metrics.quality.openQuestions > 0)
    qualityParts.push(`${metrics.quality.openQuestions} open question(s)`);

  const qualityInsights: string[] = [];
  if (metrics.quality.riskCount > 0) {
    qualityInsights.push(`${metrics.quality.riskCount} risk(s) flagged`);
  }
  if (metrics.quality.staleQuestionCount > 0) {
    qualityInsights.push(`${metrics.quality.staleQuestionCount} question(s) open for more than 2 weeks`);
  }

  areas.push({
    name: "Quality",
    status: qualityStatus,
    summary: qualityParts.length > 0 ? qualityParts.join(", ") : "no issues",
    items: metrics.quality.items,
    insights: qualityInsights,
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
