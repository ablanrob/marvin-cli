export type HealthStatus = "green" | "amber" | "red";

export interface HealthGap {
  id: string;
  title: string;
  missingFields: string[];
}

export interface HealthCategoryMetrics {
  total: number;
  complete: number;
  gaps: HealthGap[];
}

export interface HealthProcessItem {
  id: string;
  title: string;
  days: number;
}

export interface HealthProcessMetric {
  stale: HealthProcessItem[];
  agingActions: HealthProcessItem[];
  decisionVelocity: { avgDays: number; count: number };
  questionResolution: { avgDays: number; count: number };
}

export interface HealthMetrics {
  completeness: Record<string, HealthCategoryMetrics>;
  process: HealthProcessMetric;
}

export interface HealthCategory {
  name: string;
  status: HealthStatus;
  summary: string;
  items: { id: string; detail: string }[];
}

export interface HealthReport {
  projectName: string;
  generatedAt: string;
  overall: HealthStatus;
  completeness: HealthCategory[];
  process: HealthCategory[];
}
