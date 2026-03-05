import type { DocumentStore } from "./store.js";
import type { DocumentFrontmatter } from "./types.js";

const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);

/**
 * Single source of truth for any artifact's effective progress.
 * - Done status → 100
 * - Explicit `progress` field → clamped 0-100
 * - Otherwise → 0
 */
export function getEffectiveProgress(frontmatter: DocumentFrontmatter): number {
  if (DONE_STATUSES.has(frontmatter.status)) return 100;
  const raw = frontmatter.progress as number | undefined;
  if (typeof raw === "number") return Math.max(0, Math.min(100, Math.round(raw)));
  return 0;
}

/**
 * Recalculate task progress from child contributions, then propagate to parent action.
 * Returns list of artifact IDs that were updated.
 */
export function propagateProgressFromTask(
  store: DocumentStore,
  taskId: string,
): string[] {
  const updated: string[] = [];
  const task = store.get(taskId);
  if (!task) return updated;

  // If task is done, ensure progress=100
  if (DONE_STATUSES.has(task.frontmatter.status)) {
    if (task.frontmatter.progress !== 100) {
      store.update(taskId, { progress: 100 } as any);
      updated.push(taskId);
    }
  } else {
    // Auto-calculate from child contributions when children exist
    const children = store
      .list({ type: "contribution" })
      .filter((d) => d.frontmatter.aboutArtifact === taskId);

    if (children.length > 0) {
      const avg =
        children.reduce((sum, c) => sum + getEffectiveProgress(c.frontmatter), 0) /
        children.length;
      const progress = Math.round(avg);
      if (task.frontmatter.progress !== progress) {
        store.update(taskId, { progress } as any);
        updated.push(taskId);
      }
    }
  }

  // Propagate up to parent action if applicable
  const aboutArtifact = task.frontmatter.aboutArtifact as string | undefined;
  if (aboutArtifact) {
    const parent = store.get(aboutArtifact);
    if (parent && parent.frontmatter.type === "action") {
      updated.push(...propagateProgressToAction(store, aboutArtifact));
    }
  }

  return updated;
}

/**
 * Recalculate action progress from child tasks and direct contributions.
 * - Both sources: progress = taskAvg * 0.8 + contribAvg * 0.2
 * - Single source: gets 100% weight
 * - No children: keep action's own progress field
 * Returns list of artifact IDs that were updated.
 */
export function propagateProgressToAction(
  store: DocumentStore,
  actionId: string,
): string[] {
  const updated: string[] = [];
  const action = store.get(actionId);
  if (!action) return updated;

  // If action is done, ensure progress=100
  if (DONE_STATUSES.has(action.frontmatter.status)) {
    if (action.frontmatter.progress !== 100) {
      store.update(actionId, { progress: 100 } as any);
      updated.push(actionId);
    }
    return updated;
  }

  const childTasks = store
    .list({ type: "task" })
    .filter((d) => d.frontmatter.aboutArtifact === actionId);
  const directContribs = store
    .list({ type: "contribution" })
    .filter((d) => d.frontmatter.aboutArtifact === actionId);

  const hasTasks = childTasks.length > 0;
  const hasContribs = directContribs.length > 0;

  let progress: number | undefined;

  if (hasTasks && hasContribs) {
    const taskAvg =
      childTasks.reduce((s, t) => s + getEffectiveProgress(t.frontmatter), 0) /
      childTasks.length;
    const contribAvg =
      directContribs.reduce((s, c) => s + getEffectiveProgress(c.frontmatter), 0) /
      directContribs.length;
    progress = Math.round(taskAvg * 0.8 + contribAvg * 0.2);
  } else if (hasTasks) {
    progress = Math.round(
      childTasks.reduce((s, t) => s + getEffectiveProgress(t.frontmatter), 0) /
        childTasks.length,
    );
  } else if (hasContribs) {
    progress = Math.round(
      directContribs.reduce((s, c) => s + getEffectiveProgress(c.frontmatter), 0) /
        directContribs.length,
    );
  }

  if (progress !== undefined) {
    store.update(actionId, { progress } as any);
    updated.push(actionId);
  }

  return updated;
}

/**
 * Average getEffectiveProgress across all primary sprint items.
 * Replaces binary done-count formula.
 */
export function calculateSprintCompletionPct(
  primaryDocs: { frontmatter: DocumentFrontmatter }[],
): number {
  if (primaryDocs.length === 0) return 0;
  const total = primaryDocs.reduce(
    (sum, d) => sum + getEffectiveProgress(d.frontmatter),
    0,
  );
  return Math.round(total / primaryDocs.length);
}
