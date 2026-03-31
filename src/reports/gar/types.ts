export type GarStatus = "green" | "amber" | "red";

export interface GarItemRef {
  id: string;
  title: string;
  daysOverdue?: number;
  priority?: string;
  urgency?: string;
}

export interface GarMetrics {
  scope: {
    atRiskItems: GarItemRef[];
    epicSummaries: {
      id: string;
      title: string;
      tasksDone: number;
      tasksTotal: number;
      status: string;
    }[];
  };
  schedule: {
    blocked: number;
    overdue: number;
    badlyOverdueCount: number;
    items: GarItemRef[];
  };
  quality: {
    riskScore: number;
    riskCount: number;
    openQuestions: number;
    staleQuestionCount: number;
    items: GarItemRef[];
    totalOpenItems: number;
  };
}

export interface GarArea {
  name: string;
  status: GarStatus;
  summary: string;
  items: GarItemRef[];
  insights: string[];
}

export interface GarReport {
  projectName: string;
  generatedAt: string;
  overall: GarStatus;
  areas: GarArea[];
  metrics: GarMetrics;
}
