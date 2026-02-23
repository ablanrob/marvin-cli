export type GarStatus = "green" | "amber" | "red";

export interface GarItemRef {
  id: string;
  title: string;
}

export interface GarMetrics {
  scope: {
    total: number;
    open: number;
    done: number;
    completionPct: number;
  };
  schedule: {
    blocked: number;
    overdue: number;
    items: GarItemRef[];
  };
  quality: {
    risks: number;
    openQuestions: number;
    items: GarItemRef[];
  };
  resources: {
    unowned: number;
    items: GarItemRef[];
  };
}

export interface GarArea {
  name: string;
  status: GarStatus;
  summary: string;
  items: GarItemRef[];
}

export interface GarReport {
  projectName: string;
  generatedAt: string;
  overall: GarStatus;
  areas: GarArea[];
  metrics: GarMetrics;
}
