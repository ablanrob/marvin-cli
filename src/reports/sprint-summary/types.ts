export interface SprintEpicSummary {
  id: string;
  title: string;
  status: string;
  tasksDone: number;
  tasksTotal: number;
}

export interface SprintWorkItem {
  id: string;
  title: string;
  type: string;
  status: string;
  progress?: number;
  owner?: string;
  workFocus?: string;
  aboutArtifact?: string;
  children?: SprintWorkItem[];
}

export interface SprintMeetingSummary {
  id: string;
  title: string;
  date: string;
}

export interface SprintArtifactSummary {
  id: string;
  title: string;
  type: string;
  action: "created" | "updated";
  date: string;
}

export interface SprintSummaryData {
  sprint: {
    id: string;
    title: string;
    goal?: string;
    status: string;
    startDate?: string;
    endDate?: string;
  };
  timeline: {
    daysElapsed: number;
    daysRemaining: number;
    totalDays: number;
    percentComplete: number;
  };
  linkedEpics: SprintEpicSummary[];
  workItems: {
    total: number;
    done: number;
    inProgress: number;
    open: number;
    blocked: number;
    completionPct: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    items: SprintWorkItem[];
  };
  meetings: SprintMeetingSummary[];
  artifacts: SprintArtifactSummary[];
  openActions: { id: string; title: string; owner?: string; dueDate?: string }[];
  openQuestions: { id: string; title: string }[];
  blockers: { id: string; title: string; type: string }[];
  risks: { id: string; title: string; type: string }[];
  velocity: {
    currentCompletionRate: number;
    previousSprintRate?: number;
    previousSprintId?: string;
  } | null;
}
