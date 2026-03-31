import type { DocumentStore } from "../../storage/store.js";
import type { GarItemRef, GarMetrics } from "./types.js";
import { computeUrgency } from "../../web/data.js";
import { daysBetween } from "../health/collector.js";
import { normalizeLinkedEpics } from "../../plugins/builtin/tools/task-utils.js";

const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);

export function collectGarMetrics(store: DocumentStore): GarMetrics {
  const allDocs = store.list();
  const today = new Date().toISOString().slice(0, 10);

  // --- Scope: epic/sprint-aware urgency ---

  const sprints = allDocs.filter((d) => d.frontmatter.type === "sprint");
  const epics = allDocs.filter((d) => d.frontmatter.type === "epic");
  const tasks = allDocs.filter((d) => d.frontmatter.type === "task");
  const actions = allDocs.filter((d) => d.frontmatter.type === "action");
  const openActions = actions.filter((d) => !DONE_STATUSES.has(d.frontmatter.status));

  // Map epic -> tasks (via tags like epic:E-001)
  const epicToTasks = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const tags = (task.frontmatter.tags as string[]) ?? [];
    for (const tag of tags) {
      if (tag.startsWith("epic:")) {
        const epicId = tag.slice(5);
        if (!epicToTasks.has(epicId)) epicToTasks.set(epicId, []);
        epicToTasks.get(epicId)!.push(task);
      }
    }
  }

  // Active sprints -> linked epic IDs
  const activeSprints = sprints.filter((s) => {
    if (s.frontmatter.status === "active") return true;
    const start = s.frontmatter.startDate as string | undefined;
    const end = s.frontmatter.endDate as string | undefined;
    if (start && end && start <= today && end >= today) return true;
    return false;
  });

  const activeEpicIds = new Set<string>();
  for (const s of activeSprints) {
    for (const eid of normalizeLinkedEpics(s.frontmatter.linkedEpics)) {
      activeEpicIds.add(eid);
    }
  }

  // Epic summaries for active sprint epics
  const epicSummaries: GarMetrics["scope"]["epicSummaries"] = [];
  for (const epic of epics) {
    if (!activeEpicIds.has(epic.frontmatter.id)) continue;
    const epicTasks = epicToTasks.get(epic.frontmatter.id) ?? [];
    const tasksDone = epicTasks.filter((t) => DONE_STATUSES.has(t.frontmatter.status)).length;
    epicSummaries.push({
      id: epic.frontmatter.id,
      title: epic.frontmatter.title,
      tasksDone,
      tasksTotal: epicTasks.length,
      status: epic.frontmatter.status,
    });
  }

  // Find sprint end dates for proximity check
  const sprintEndSoon = activeSprints.some((s) => {
    const endDate = s.frontmatter.endDate as string | undefined;
    if (!endDate) return false;
    return daysBetween(today, endDate) <= 7;
  });

  // At-risk items
  const atRiskItems: GarItemRef[] = [];
  const seenAtRisk = new Set<string>();

  // Open actions with due dates approaching
  for (const action of openActions) {
    const dueDate = action.frontmatter.dueDate;
    if (typeof dueDate !== "string") continue;
    const urgency = computeUrgency(dueDate, today);
    const priority = (action.frontmatter.priority as string)?.toLowerCase() ?? "";
    const overdueDays = daysBetween(dueDate, today);
    const isOverdue = urgency === "overdue";
    const isDueSoonCritical =
      urgency === "due-3d" && (priority === "critical" || priority === "high");

    if ((isOverdue || isDueSoonCritical) && !seenAtRisk.has(action.frontmatter.id)) {
      seenAtRisk.add(action.frontmatter.id);
      atRiskItems.push({
        id: action.frontmatter.id,
        title: action.frontmatter.title,
        daysOverdue: isOverdue ? overdueDays : undefined,
        priority: action.frontmatter.priority as string,
        urgency,
      });
    }
  }

  // Epics with <50% tasks done and sprint ending within 7 days
  if (sprintEndSoon) {
    for (const es of epicSummaries) {
      if (es.tasksTotal > 0 && es.tasksDone / es.tasksTotal < 0.5 && !seenAtRisk.has(es.id)) {
        seenAtRisk.add(es.id);
        atRiskItems.push({
          id: es.id,
          title: es.title,
          urgency: "due-7d",
        });
      }
    }
  }

  // --- Schedule: blocked/overdue with daysOverdue ---

  const blockedItems = allDocs.filter(
    (d) => d.frontmatter.tags?.includes("blocked") && !DONE_STATUSES.has(d.frontmatter.status),
  );

  const tagOverdueItems = allDocs.filter(
    (d) => d.frontmatter.tags?.includes("overdue") && !DONE_STATUSES.has(d.frontmatter.status),
  );

  const dateOverdueActions = openActions.filter((d) => {
    const dueDate = d.frontmatter.dueDate;
    return typeof dueDate === "string" && dueDate < today;
  });

  const overdueItems = [...tagOverdueItems, ...dateOverdueActions].filter(
    (d, i, arr) => arr.findIndex((x) => x.frontmatter.id === d.frontmatter.id) === i,
  );

  const scheduleItems: GarItemRef[] = [...blockedItems, ...overdueItems]
    .filter((d, i, arr) => arr.findIndex((x) => x.frontmatter.id === d.frontmatter.id) === i)
    .map((d) => {
      const dueDate = d.frontmatter.dueDate;
      const overdue =
        typeof dueDate === "string" && dueDate < today ? daysBetween(dueDate, today) : undefined;
      return {
        id: d.frontmatter.id,
        title: d.frontmatter.title,
        daysOverdue: overdue,
      };
    });

  const badlyOverdueCount = scheduleItems.filter(
    (item) => item.daysOverdue !== undefined && item.daysOverdue > 7,
  ).length;

  // --- Quality: weighted risk scoring ---

  const openQuestions = store.list({ type: "question", status: "open" });
  const riskItems = allDocs.filter(
    (d) => d.frontmatter.tags?.includes("risk") && !DONE_STATUSES.has(d.frontmatter.status),
  );

  // Score risks by priority
  const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  let riskScore = 0;
  for (const r of riskItems) {
    const priority = (r.frontmatter.priority as string)?.toLowerCase() ?? "low";
    riskScore += priorityWeight[priority] ?? 1;
  }

  // Stale questions: open questions older than 14 days
  const staleQuestionCount = openQuestions.filter((q) => {
    return daysBetween(q.frontmatter.created, today) > 14;
  }).length;

  // Total open items for relative threshold
  const totalOpenItems = allDocs.filter((d) => !DONE_STATUSES.has(d.frontmatter.status)).length;

  const qualityItems: GarItemRef[] = [...riskItems, ...openQuestions]
    .filter((d, i, arr) => arr.findIndex((x) => x.frontmatter.id === d.frontmatter.id) === i)
    .map((d) => ({
      id: d.frontmatter.id,
      title: d.frontmatter.title,
      priority: d.frontmatter.priority as string | undefined,
    }));

  return {
    scope: {
      atRiskItems,
      epicSummaries,
    },
    schedule: {
      blocked: blockedItems.length,
      overdue: overdueItems.length,
      badlyOverdueCount,
      items: scheduleItems,
    },
    quality: {
      riskScore,
      riskCount: riskItems.length,
      openQuestions: openQuestions.length,
      staleQuestionCount,
      items: qualityItems,
      totalOpenItems,
    },
  };
}
