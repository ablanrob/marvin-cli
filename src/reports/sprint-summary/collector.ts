import type { DocumentStore } from "../../storage/store.js";
import type { Document } from "../../storage/types.js";
import { normalizeLinkedEpics } from "../../plugins/builtin/tools/task-utils.js";
import {
  calculateSprintCompletionPct,
  getEffectiveProgress,
} from "../../storage/progress.js";
import type {
  SprintSummaryData,
  SprintEpicSummary,
  SprintWorkItem,
  SprintMeetingSummary,
  SprintArtifactSummary,
} from "./types.js";

const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);

export function collectSprintSummaryData(
  store: DocumentStore,
  sprintId?: string,
): SprintSummaryData | null {
  const allDocs = store.list();
  const sprintDocs = allDocs.filter((d) => d.frontmatter.type === "sprint");

  // Find the target sprint
  let sprintDoc: Document | undefined;
  if (sprintId) {
    sprintDoc = sprintDocs.find((d) => d.frontmatter.id === sprintId);
  } else {
    // Find the active sprint
    sprintDoc = sprintDocs.find((d) => d.frontmatter.status === "active");
  }

  if (!sprintDoc) return null;

  const fm = sprintDoc.frontmatter;
  const startDate = fm.startDate as string | undefined;
  const endDate = fm.endDate as string | undefined;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // --- Timeline ---
  let daysElapsed = 0;
  let daysRemaining = 0;
  let totalDays = 0;
  let percentComplete = 0;

  if (startDate && endDate) {
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const todayMs = today.getTime();
    const msPerDay = 86_400_000;

    totalDays = Math.max(1, Math.round((endMs - startMs) / msPerDay));
    daysElapsed = Math.max(0, Math.round((todayMs - startMs) / msPerDay));
    daysRemaining = Math.max(0, Math.round((endMs - todayMs) / msPerDay));
    percentComplete = Math.min(100, Math.round((daysElapsed / totalDays) * 100));
  }

  // --- Linked Epics ---
  const linkedEpicIds = normalizeLinkedEpics(fm.linkedEpics);
  const epicToTasks = new Map<string, Document[]>();

  // Build epic→tasks index via tags
  const allTasks = allDocs.filter((d) => d.frontmatter.type === "task");
  for (const task of allTasks) {
    const tags = (task.frontmatter.tags as string[]) ?? [];
    for (const tag of tags) {
      if (tag.startsWith("epic:")) {
        const epicId = tag.slice(5);
        if (!epicToTasks.has(epicId)) epicToTasks.set(epicId, []);
        epicToTasks.get(epicId)!.push(task);
      }
    }
  }

  const linkedEpics: SprintEpicSummary[] = linkedEpicIds.map((epicId) => {
    const epic = store.get(epicId);
    const tasks = epicToTasks.get(epicId) ?? [];
    const tasksDone = tasks.filter((t) => DONE_STATUSES.has(t.frontmatter.status)).length;
    return {
      id: epicId,
      title: epic?.frontmatter.title ?? "(not found)",
      status: epic?.frontmatter.status ?? "unknown",
      tasksDone,
      tasksTotal: tasks.length,
    };
  });

  // --- Work Items (tagged sprint:SP-xxx) ---
  const sprintTag = `sprint:${fm.id}`;
  const workItemDocs = allDocs.filter(
    (d) =>
      d.frontmatter.type !== "sprint" &&
      d.frontmatter.type !== "epic" &&
      d.frontmatter.type !== "meeting" &&
      d.frontmatter.tags?.includes(sprintTag),
  );

  // Completion stats count only primary items (contributions are supplementary)
  const primaryDocs = workItemDocs.filter((d) => d.frontmatter.type !== "contribution");
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let doneCount = 0;
  let inProgressCount = 0;
  let openCount = 0;
  let blockedCount = 0;

  for (const doc of primaryDocs) {
    const s = doc.frontmatter.status;
    byStatus[s] = (byStatus[s] ?? 0) + 1;
    byType[doc.frontmatter.type] = (byType[doc.frontmatter.type] ?? 0) + 1;
    if (DONE_STATUSES.has(s)) doneCount++;
    else if (s === "in-progress") inProgressCount++;
    else if (s === "blocked") blockedCount++;
    else openCount++;
  }

  // Build a tree from aboutArtifact references (action → task → contribution)
  const allItemsById = new Map<string, SprintWorkItem>();
  const childrenByParent = new Map<string, SprintWorkItem[]>();
  const sprintItemIds = new Set(workItemDocs.map((d) => d.frontmatter.id));

  for (const doc of workItemDocs) {
    const about = doc.frontmatter.aboutArtifact as string | undefined;
    const streamTag = (doc.frontmatter.tags as string[] ?? []).find((t) => t.startsWith("stream:"));
    const item: SprintWorkItem = {
      id: doc.frontmatter.id,
      title: doc.frontmatter.title,
      type: doc.frontmatter.type,
      status: doc.frontmatter.status,
      progress: getEffectiveProgress(doc.frontmatter),
      workStream: streamTag ? streamTag.slice(7) : undefined,
      aboutArtifact: about,
    };
    allItemsById.set(item.id, item);

    // Only nest if the parent is also in this sprint
    if (about && sprintItemIds.has(about)) {
      if (!childrenByParent.has(about)) childrenByParent.set(about, []);
      childrenByParent.get(about)!.push(item);
    }
  }

  // Attach children recursively and collect root items
  const itemsWithChildren = new Set<string>();
  for (const [parentId, children] of childrenByParent) {
    const parent = allItemsById.get(parentId);
    if (parent) {
      parent.children = children;
      for (const child of children) itemsWithChildren.add(child.id);
    }
  }

  // Recursively attach grandchildren (e.g. contributions under tasks under actions)
  for (const item of allItemsById.values()) {
    if (item.children) {
      for (const child of item.children) {
        const grandchildren = childrenByParent.get(child.id);
        if (grandchildren) {
          child.children = grandchildren;
          for (const gc of grandchildren) itemsWithChildren.add(gc.id);
        }
      }
    }
  }

  // Root items: those not nested under any other sprint item
  const items: SprintWorkItem[] = [];
  for (const doc of workItemDocs) {
    if (!itemsWithChildren.has(doc.frontmatter.id)) {
      items.push(allItemsById.get(doc.frontmatter.id)!);
    }
  }

  const workItems: SprintSummaryData["workItems"] = {
    total: primaryDocs.length,
    done: doneCount,
    inProgress: inProgressCount,
    open: openCount,
    blocked: blockedCount,
    completionPct: calculateSprintCompletionPct(primaryDocs),
    byStatus,
    byType,
    items,
  };

  // --- Meetings during sprint ---
  const meetings: SprintMeetingSummary[] = [];
  if (startDate && endDate) {
    const meetingDocs = allDocs.filter((d) => d.frontmatter.type === "meeting");
    for (const m of meetingDocs) {
      const meetingDate = (m.frontmatter.date as string) ?? m.frontmatter.created.slice(0, 10);
      if (meetingDate >= startDate && meetingDate <= endDate) {
        meetings.push({
          id: m.frontmatter.id,
          title: m.frontmatter.title,
          date: meetingDate,
        });
      }
    }
    meetings.sort((a, b) => a.date.localeCompare(b.date));
  }

  // --- Artifacts created/updated during sprint ---
  const artifacts: SprintArtifactSummary[] = [];
  if (startDate && endDate) {
    for (const doc of allDocs) {
      if (doc.frontmatter.type === "sprint") continue;
      const created = doc.frontmatter.created.slice(0, 10);
      const updated = doc.frontmatter.updated.slice(0, 10);

      if (created >= startDate && created <= endDate) {
        artifacts.push({
          id: doc.frontmatter.id,
          title: doc.frontmatter.title,
          type: doc.frontmatter.type,
          action: "created",
          date: created,
        });
      } else if (updated >= startDate && updated <= endDate && updated !== created) {
        artifacts.push({
          id: doc.frontmatter.id,
          title: doc.frontmatter.title,
          type: doc.frontmatter.type,
          action: "updated",
          date: updated,
        });
      }
    }
    artifacts.sort((a, b) => b.date.localeCompare(a.date));
  }

  // --- Open Actions & Questions tagged to sprint or its epics ---
  const relevantTags = new Set([sprintTag, ...linkedEpicIds.map((id) => `epic:${id}`)]);

  const openActions = allDocs
    .filter(
      (d) =>
        d.frontmatter.type === "action" &&
        !DONE_STATUSES.has(d.frontmatter.status) &&
        d.frontmatter.tags?.some((t: string) => relevantTags.has(t)),
    )
    .map((d) => ({
      id: d.frontmatter.id,
      title: d.frontmatter.title,
      owner: d.frontmatter.owner,
      dueDate: d.frontmatter.dueDate,
    }));

  const openQuestions = allDocs
    .filter(
      (d) =>
        d.frontmatter.type === "question" &&
        d.frontmatter.status === "open" &&
        d.frontmatter.tags?.some((t: string) => relevantTags.has(t)),
    )
    .map((d) => ({
      id: d.frontmatter.id,
      title: d.frontmatter.title,
    }));

  // --- Blockers ---
  const blockers = allDocs
    .filter(
      (d) =>
        d.frontmatter.status === "blocked" &&
        d.frontmatter.tags?.includes(sprintTag),
    )
    .map((d) => ({
      id: d.frontmatter.id,
      title: d.frontmatter.title,
      type: d.frontmatter.type,
    }));

  // Also add items tagged as risk/blocker
  const riskBlockers = allDocs.filter(
    (d) =>
      !DONE_STATUSES.has(d.frontmatter.status) &&
      d.frontmatter.tags?.includes("risk") &&
      d.frontmatter.tags?.some((t: string) => relevantTags.has(t)) &&
      !blockers.some((b) => b.id === d.frontmatter.id),
  );
  for (const d of riskBlockers) {
    blockers.push({
      id: d.frontmatter.id,
      title: d.frontmatter.title,
      type: d.frontmatter.type,
    });
  }

  // --- Velocity comparison ---
  let velocity: SprintSummaryData["velocity"] = null;
  const currentRate = workItems.completionPct;

  // Find the most recently completed sprint (before current one)
  const completedSprints = sprintDocs
    .filter((s) => DONE_STATUSES.has(s.frontmatter.status) && s.frontmatter.id !== fm.id)
    .sort((a, b) => (b.frontmatter.endDate as string ?? "").localeCompare(a.frontmatter.endDate as string ?? ""));

  if (completedSprints.length > 0) {
    const prev = completedSprints[0];
    const prevTag = `sprint:${prev.frontmatter.id}`;
    const prevWorkItems = allDocs.filter(
      (d) =>
        d.frontmatter.type !== "sprint" &&
        d.frontmatter.type !== "epic" &&
        d.frontmatter.type !== "contribution" &&
        d.frontmatter.tags?.includes(prevTag),
    );
    const prevRate = calculateSprintCompletionPct(prevWorkItems);
    velocity = {
      currentCompletionRate: currentRate,
      previousSprintRate: prevRate,
      previousSprintId: prev.frontmatter.id,
    };
  } else {
    velocity = { currentCompletionRate: currentRate };
  }

  return {
    sprint: {
      id: fm.id,
      title: fm.title,
      goal: fm.goal as string | undefined,
      status: fm.status,
      startDate,
      endDate,
    },
    timeline: { daysElapsed, daysRemaining, totalDays, percentComplete },
    linkedEpics,
    workItems,
    meetings,
    artifacts,
    openActions,
    openQuestions,
    blockers,
    velocity,
  };
}
