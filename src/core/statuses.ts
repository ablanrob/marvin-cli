/** Statuses that indicate a work item is complete. */
export const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);

/** Extended done statuses including decision-specific terminal states. */
export const DONE_STATUSES_WITH_DECIDED = new Set([...DONE_STATUSES, "decided"]);
