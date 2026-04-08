import type { HealthCategory, HealthMetrics, HealthReport, HealthStatus } from "./types.js";

// Health evaluation thresholds
const COMPLETENESS_AMBER_PCT = 75;
const STALE_AMBER_THRESHOLD = 3;
const AGING_AMBER_THRESHOLD = 3;
const DECISION_VELOCITY_GREEN_DAYS = 7;
const DECISION_VELOCITY_AMBER_DAYS = 21;
const QUESTION_RESOLUTION_GREEN_DAYS = 7;
const QUESTION_RESOLUTION_AMBER_DAYS = 14;

function worstStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("red")) return "red";
  if (statuses.includes("amber")) return "amber";
  return "green";
}

function completenessStatus(total: number, complete: number): HealthStatus {
  if (total === 0) return "green";
  const pct = Math.round((complete / total) * 100);
  if (pct >= 100) return "green";
  if (pct >= COMPLETENESS_AMBER_PCT) return "amber";
  return "red";
}

const TYPE_LABELS: Record<string, string> = {
  action: "Actions",
  decision: "Decisions",
  question: "Questions",
  feature: "Features",
  epic: "Epics",
  sprint: "Sprints",
};

export function evaluateHealth(projectName: string, metrics: HealthMetrics): HealthReport {
  const completeness: HealthCategory[] = [];

  for (const [type, catMetrics] of Object.entries(metrics.completeness)) {
    const { total, complete, gaps } = catMetrics;
    const status = completenessStatus(total, complete);
    const pct = total > 0 ? Math.round((complete / total) * 100) : 100;

    completeness.push({
      name: TYPE_LABELS[type] ?? type,
      status,
      summary: `${pct}% complete (${complete}/${total})`,
      items: gaps.map((g) => ({
        id: g.id,
        detail: `missing: ${g.missingFields.join(", ")}`,
      })),
    });
  }

  // Process categories
  const process: HealthCategory[] = [];

  // Stale items
  const staleCount = metrics.process.stale.length;
  const staleStatus: HealthStatus =
    staleCount === 0 ? "green" : staleCount <= STALE_AMBER_THRESHOLD ? "amber" : "red";
  process.push({
    name: "Stale Items",
    status: staleStatus,
    summary: staleCount === 0 ? "no stale items" : `${staleCount} item(s) not updated in 14+ days`,
    items: metrics.process.stale.map((s) => ({
      id: s.id,
      detail: `${s.days} days since last update`,
    })),
  });

  // Aging actions
  const agingCount = metrics.process.agingActions.length;
  const agingStatus: HealthStatus =
    agingCount === 0 ? "green" : agingCount <= AGING_AMBER_THRESHOLD ? "amber" : "red";
  process.push({
    name: "Aging Actions",
    status: agingStatus,
    summary: agingCount === 0 ? "no aging actions" : `${agingCount} action(s) open for 30+ days`,
    items: metrics.process.agingActions.map((a) => ({
      id: a.id,
      detail: `open for ${a.days} days`,
    })),
  });

  // Decision velocity
  const dv = metrics.process.decisionVelocity;
  let dvStatus: HealthStatus;
  if (dv.count === 0) {
    dvStatus = "green";
  } else if (dv.avgDays <= DECISION_VELOCITY_GREEN_DAYS) {
    dvStatus = "green";
  } else if (dv.avgDays <= DECISION_VELOCITY_AMBER_DAYS) {
    dvStatus = "amber";
  } else {
    dvStatus = "red";
  }
  process.push({
    name: "Decision Velocity",
    status: dvStatus,
    summary:
      dv.count === 0
        ? "no resolved decisions"
        : `avg ${dv.avgDays} days to resolve (${dv.count} decision(s))`,
    items: [],
  });

  // Question resolution
  const qr = metrics.process.questionResolution;
  let qrStatus: HealthStatus;
  if (qr.count === 0) {
    qrStatus = "green";
  } else if (qr.avgDays <= QUESTION_RESOLUTION_GREEN_DAYS) {
    qrStatus = "green";
  } else if (qr.avgDays <= QUESTION_RESOLUTION_AMBER_DAYS) {
    qrStatus = "amber";
  } else {
    qrStatus = "red";
  }
  process.push({
    name: "Question Resolution",
    status: qrStatus,
    summary:
      qr.count === 0
        ? "no answered questions"
        : `avg ${qr.avgDays} days to answer (${qr.count} question(s))`,
    items: [],
  });

  const allStatuses = [...completeness.map((c) => c.status), ...process.map((p) => p.status)];
  const overall = worstStatus(allStatuses);

  return {
    projectName,
    generatedAt: new Date().toISOString().slice(0, 10),
    overall,
    completeness,
    process,
  };
}
