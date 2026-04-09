/** Statuses that indicate a work item is complete. */
export const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);

/** Extended done statuses including decision-specific terminal states. */
export const DONE_STATUSES_WITH_DECIDED = new Set([...DONE_STATUSES, "decided"]);

// ---------------------------------------------------------------------------
// Canonical status lists per artifact type
// ---------------------------------------------------------------------------

export const FEATURE_STATUSES = ["draft", "approved", "done"] as const;
export const EPIC_STATUSES = ["planned", "in-progress", "done"] as const;
export const TASK_STATUSES = ["backlog", "ready", "in-progress", "review", "test", "done"] as const;
export const SPRINT_STATUSES = ["planned", "active", "completed"] as const;
export const ACTION_STATUSES = ["open", "in-progress", "done"] as const;
export const MEETING_STATUSES = ["scheduled", "completed"] as const;
export const DECISION_STATUSES = ["open", "decided", "superseded"] as const;
export const QUESTION_STATUSES = ["open", "answered"] as const;
