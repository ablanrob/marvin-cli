import type { DocumentStore } from "../storage/store.js";
import type { Document } from "../storage/types.js";
import { normalizeLinkedFeatures } from "../plugins/builtin/tools/epic-utils.js";
import { normalizeLinkedEpics } from "../plugins/builtin/tools/task-utils.js";
import { daysBetween } from "../reports/health/collector.js";
import { collectGarMetrics } from "../reports/gar/collector.js";
import { evaluateGar } from "../reports/gar/evaluator.js";
import type { GarReport } from "../reports/gar/types.js";
import { collectHealthMetrics } from "../reports/health/collector.js";
import { evaluateHealth } from "../reports/health/evaluator.js";
import type { HealthReport } from "../reports/health/types.js";
import { collectSprintSummaryData } from "../reports/sprint-summary/collector.js";
import type { SprintSummaryData } from "../reports/sprint-summary/types.js";

export interface TypeSummary {
  type: string;
  total: number;
  open: number;
}

export interface OverviewData {
  types: TypeSummary[];
  recent: Document[];
}

export interface DocumentListData {
  type: string;
  docs: Document[];
  statuses: string[];
  owners: string[];
  filterStatus?: string;
  filterOwner?: string;
}

export interface BoardColumn {
  status: string;
  docs: Document[];
}

export interface BoardData {
  columns: BoardColumn[];
  type?: string;
  types: string[];
}

export function getOverviewData(store: DocumentStore): OverviewData {
  const types: TypeSummary[] = [];
  const counts = store.counts();

  for (const type of store.registeredTypes) {
    const total = counts[type] ?? 0;
    const open = store.list({ type, status: "open" }).length;
    types.push({ type, total, open });
  }

  const allDocs = store.list();
  const sorted = allDocs.sort((a, b) =>
    (b.frontmatter.updated ?? b.frontmatter.created).localeCompare(
      a.frontmatter.updated ?? a.frontmatter.created,
    ),
  );

  return { types, recent: sorted.slice(0, 20) };
}

export function getDocumentListData(
  store: DocumentStore,
  type: string,
  filterStatus?: string,
  filterOwner?: string,
): DocumentListData | undefined {
  if (!store.registeredTypes.includes(type)) return undefined;

  const allOfType = store.list({ type });
  const statuses = [...new Set(allOfType.map((d) => d.frontmatter.status))].sort();
  const owners = [
    ...new Set(allOfType.map((d) => d.frontmatter.owner).filter(Boolean) as string[]),
  ].sort();

  let docs = allOfType;
  if (filterStatus) {
    docs = docs.filter((d) => d.frontmatter.status === filterStatus);
  }
  if (filterOwner) {
    docs = docs.filter((d) => d.frontmatter.owner === filterOwner);
  }

  docs.sort((a, b) => a.frontmatter.id.localeCompare(b.frontmatter.id));

  return { type, docs, statuses, owners, filterStatus, filterOwner };
}

export function getDocumentDetail(
  store: DocumentStore,
  type: string,
  id: string,
): Document | undefined {
  if (!store.registeredTypes.includes(type)) return undefined;
  return store.get(id);
}

export function getGarData(store: DocumentStore, projectName: string): GarReport {
  const metrics = collectGarMetrics(store);
  return evaluateGar(projectName, metrics);
}

export function getBoardData(
  store: DocumentStore,
  type?: string,
): BoardData {
  const docs = type ? store.list({ type }) : store.list();
  const types = store.registeredTypes;

  // Collect all statuses and group
  const byStatus = new Map<string, Document[]>();
  for (const doc of docs) {
    const status = doc.frontmatter.status;
    if (!byStatus.has(status)) byStatus.set(status, []);
    byStatus.get(status)!.push(doc);
  }

  // Order columns: open, draft, in-progress, then rest alphabetically, done last
  const statusOrder = ["open", "draft", "in-progress", "blocked"];
  const allStatuses = [...byStatus.keys()];
  const ordered: string[] = [];

  for (const s of statusOrder) {
    if (allStatuses.includes(s)) ordered.push(s);
  }
  for (const s of allStatuses.sort()) {
    if (!ordered.includes(s) && s !== "done" && s !== "closed" && s !== "resolved") {
      ordered.push(s);
    }
  }
  for (const s of ["done", "closed", "resolved"]) {
    if (allStatuses.includes(s)) ordered.push(s);
  }

  const columns: BoardColumn[] = ordered.map((status) => ({
    status,
    docs: byStatus.get(status) ?? [],
  }));

  return { columns, type, types };
}

export function getHealthData(store: DocumentStore, projectName: string): HealthReport {
  const metrics = collectHealthMetrics(store);
  return evaluateHealth(projectName, metrics);
}

export interface DiagramDataResult {
  sprints: { id: string; title: string; status: string; startDate?: string; endDate?: string; linkedEpics: string[] }[];
  epics: { id: string; title: string; status: string; linkedFeature: string[] }[];
  features: { id: string; title: string; status: string }[];
  statusCounts: Record<string, number>;
}

export function getDiagramData(store: DocumentStore): DiagramDataResult {
  const allDocs = store.list();
  const sprints: DiagramDataResult["sprints"] = [];
  const epics: DiagramDataResult["epics"] = [];
  const features: DiagramDataResult["features"] = [];
  const statusCounts: Record<string, number> = {};

  for (const doc of allDocs) {
    const fm = doc.frontmatter;
    const status = fm.status.toLowerCase();
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    switch (fm.type) {
      case "sprint":
        sprints.push({
          id: fm.id,
          title: fm.title,
          status: fm.status,
          startDate: fm.startDate as string | undefined,
          endDate: fm.endDate as string | undefined,
          linkedEpics: (fm.linkedEpics as string[]) ?? [],
        });
        break;
      case "epic":
        epics.push({
          id: fm.id,
          title: fm.title,
          status: fm.status,
          linkedFeature: normalizeLinkedFeatures(fm.linkedFeature),
        });
        break;
      case "feature":
        features.push({
          id: fm.id,
          title: fm.title,
          status: fm.status,
        });
        break;
    }
  }

  return { sprints, epics, features, statusCounts };
}

// --- Upcoming page ---

export type UrgencyTier = "overdue" | "due-3d" | "due-7d" | "upcoming" | "later";

export interface DueSoonAction {
  id: string;
  title: string;
  status: string;
  owner?: string;
  dueDate: string;
  urgency: UrgencyTier;
  relatedTaskCount: number;
}

export interface DueSoonSprintTask {
  id: string;
  title: string;
  status: string;
  sprintId: string;
  sprintTitle: string;
  sprintEndDate: string;
  urgency: UrgencyTier;
}

export interface TrendingSignal {
  factor: string;
  points: number;
}

export interface TrendingItem {
  id: string;
  title: string;
  type: string;
  status: string;
  score: number;
  signals: TrendingSignal[];
}

export interface UpcomingData {
  dueSoonActions: DueSoonAction[];
  dueSoonSprintTasks: DueSoonSprintTask[];
  trending: TrendingItem[];
}

export function computeUrgency(dueDateStr: string, todayStr: string): UrgencyTier {
  const due = new Date(dueDateStr).getTime();
  const today = new Date(todayStr).getTime();
  const diffDays = Math.floor((due - today) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "due-3d";
  if (diffDays <= 7) return "due-7d";
  if (diffDays <= 14) return "upcoming";
  return "later";
}

const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled"]);

export function getUpcomingData(store: DocumentStore): UpcomingData {
  const today = new Date().toISOString().slice(0, 10);
  const allDocs = store.list();

  // Index documents by ID for cross-reference lookups
  const docById = new Map<string, Document>();
  for (const doc of allDocs) {
    docById.set(doc.frontmatter.id, doc);
  }

  // --- Due Soon: Actions ---
  const actions = allDocs.filter(
    (d) => d.frontmatter.type === "action" && !DONE_STATUSES.has(d.frontmatter.status),
  );
  const actionsWithDue = actions.filter((d) => d.frontmatter.dueDate);

  // Build sprint→epic→task chain for related task counts
  const sprints = allDocs.filter((d) => d.frontmatter.type === "sprint");
  const epics = allDocs.filter((d) => d.frontmatter.type === "epic");
  const tasks = allDocs.filter((d) => d.frontmatter.type === "task");

  // Map epic → tasks (via tags like epic:E-001)
  const epicToTasks = new Map<string, Document[]>();
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

  // Map sprint → linked tasks (via linkedEpics → tasks tagged with those epics)
  function getSprintTasks(sprintDoc: Document): Document[] {
    const linkedEpics = normalizeLinkedEpics(sprintDoc.frontmatter.linkedEpics);
    const result: Document[] = [];
    for (const epicId of linkedEpics) {
      const epicTasks = epicToTasks.get(epicId) ?? [];
      result.push(...epicTasks);
    }
    return result;
  }

  // For each action, find related tasks via sprint tags
  function countRelatedTasks(actionDoc: Document): number {
    const actionTags = (actionDoc.frontmatter.tags as string[]) ?? [];
    const relatedTaskIds = new Set<string>();
    for (const tag of actionTags) {
      if (tag.startsWith("sprint:")) {
        const sprintId = tag.slice(7);
        const sprint = docById.get(sprintId);
        if (sprint) {
          const sprintTaskDocs = getSprintTasks(sprint);
          for (const t of sprintTaskDocs) relatedTaskIds.add(t.frontmatter.id);
        }
      }
    }
    return relatedTaskIds.size;
  }

  const dueSoonActions: DueSoonAction[] = actionsWithDue
    .map((d) => ({
      id: d.frontmatter.id,
      title: d.frontmatter.title,
      status: d.frontmatter.status,
      owner: d.frontmatter.owner,
      dueDate: d.frontmatter.dueDate!,
      urgency: computeUrgency(d.frontmatter.dueDate!, today),
      relatedTaskCount: countRelatedTasks(d),
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // --- Due Soon: Sprint Tasks ---
  const todayMs = new Date(today).getTime();
  const fourteenDaysMs = 14 * 86_400_000;

  // Find sprints ending within 14 days
  const nearSprints = sprints.filter((s) => {
    const endDate = s.frontmatter.endDate as string | undefined;
    if (!endDate) return false;
    const endMs = new Date(endDate).getTime();
    const diff = endMs - todayMs;
    return diff >= 0 && diff <= fourteenDaysMs;
  });

  // Collect sprint tasks, deduplicate (nearest sprint end wins)
  const taskSprintMap = new Map<string, { task: Document; sprint: Document; sprintEnd: string }>();
  for (const sprint of nearSprints) {
    const sprintEnd = sprint.frontmatter.endDate as string;
    const sprintTaskDocs = getSprintTasks(sprint);
    for (const task of sprintTaskDocs) {
      if (DONE_STATUSES.has(task.frontmatter.status)) continue;
      const existing = taskSprintMap.get(task.frontmatter.id);
      if (!existing || sprintEnd < existing.sprintEnd) {
        taskSprintMap.set(task.frontmatter.id, { task, sprint, sprintEnd });
      }
    }
  }

  const dueSoonSprintTasks: DueSoonSprintTask[] = [...taskSprintMap.values()]
    .map(({ task, sprint, sprintEnd }) => ({
      id: task.frontmatter.id,
      title: task.frontmatter.title,
      status: task.frontmatter.status,
      sprintId: sprint.frontmatter.id,
      sprintTitle: sprint.frontmatter.title,
      sprintEndDate: sprintEnd,
      urgency: computeUrgency(sprintEnd, today),
    }))
    .sort((a, b) => a.sprintEndDate.localeCompare(b.sprintEndDate));

  // --- Trending ---
  const openItems = allDocs.filter(
    (d) =>
      ["action", "question", "task"].includes(d.frontmatter.type) &&
      !DONE_STATUSES.has(d.frontmatter.status),
  );

  // Pre-compute: meeting mentions in last 14 days
  const fourteenDaysAgo = new Date(todayMs - fourteenDaysMs).toISOString().slice(0, 10);
  const recentMeetings = allDocs.filter(
    (d) =>
      d.frontmatter.type === "meeting" &&
      (d.frontmatter.updated ?? d.frontmatter.created) >= fourteenDaysAgo,
  );

  // Pre-compute: cross-reference index (how many other docs mention each ID in their content)
  const crossRefCounts = new Map<string, number>();
  for (const doc of allDocs) {
    const content = doc.content ?? "";
    for (const item of openItems) {
      if (doc.frontmatter.id === item.frontmatter.id) continue;
      if (content.includes(item.frontmatter.id)) {
        crossRefCounts.set(
          item.frontmatter.id,
          (crossRefCounts.get(item.frontmatter.id) ?? 0) + 1,
        );
      }
    }
  }

  // Active / near-starting sprints for proximity scoring
  const activeSprints = sprints.filter((s) => {
    const status = s.frontmatter.status;
    if (status === "active") return true;
    const startDate = s.frontmatter.startDate as string | undefined;
    if (!startDate) return false;
    const startMs = new Date(startDate).getTime();
    const diff = startMs - todayMs;
    return diff >= 0 && diff <= fourteenDaysMs;
  });
  const activeSprintIds = new Set(activeSprints.map((s) => s.frontmatter.id));
  // Build set of epic IDs linked to active sprints
  const activeEpicIds = new Set<string>();
  for (const s of activeSprints) {
    for (const epicId of normalizeLinkedEpics(s.frontmatter.linkedEpics)) {
      activeEpicIds.add(epicId);
    }
  }

  const trending: TrendingItem[] = openItems
    .map((doc) => {
      const signals: TrendingSignal[] = [];
      let score = 0;

      // Recency: max 20 pts, decay over 30 days
      const updated = doc.frontmatter.updated ?? doc.frontmatter.created;
      const ageDays = daysBetween(updated, today);
      const recencyPts = Math.max(0, Math.round(20 * (1 - ageDays / 30)));
      if (recencyPts > 0) {
        signals.push({ factor: "recency", points: recencyPts });
        score += recencyPts;
      }

      // Sprint proximity: max 25 pts
      const tags = (doc.frontmatter.tags as string[]) ?? [];
      const linkedToActiveSprint = tags.some(
        (t) => t.startsWith("sprint:") && activeSprintIds.has(t.slice(7)),
      );
      const linkedToActiveEpic = tags.some(
        (t) => t.startsWith("epic:") && activeEpicIds.has(t.slice(5)),
      );
      if (linkedToActiveSprint) {
        signals.push({ factor: "sprint proximity", points: 25 });
        score += 25;
      } else if (linkedToActiveEpic) {
        signals.push({ factor: "sprint proximity", points: 15 });
        score += 15;
      }

      // Meeting mentions: max 15 pts
      const mentionCount = recentMeetings.filter(
        (m) => (m.content ?? "").includes(doc.frontmatter.id),
      ).length;
      if (mentionCount > 0) {
        const meetingPts = Math.min(15, mentionCount * 5);
        signals.push({ factor: "meeting mentions", points: meetingPts });
        score += meetingPts;
      }

      // Priority: max 15 pts
      const priority = (doc.frontmatter.priority as string)?.toLowerCase();
      const priorityPts =
        priority === "critical" ? 15 : priority === "high" ? 10 : priority === "medium" ? 3 : 0;
      if (priorityPts > 0) {
        signals.push({ factor: "priority", points: priorityPts });
        score += priorityPts;
      }

      // Aging: max 10 pts for open questions/actions older than 14 days
      if (["action", "question"].includes(doc.frontmatter.type)) {
        const createdDays = daysBetween(doc.frontmatter.created, today);
        if (createdDays >= 14) {
          const agingPts = Math.min(10, Math.floor((createdDays - 14) / 7) * 3 + 5);
          signals.push({ factor: "aging", points: agingPts });
          score += agingPts;
        }
      }

      // Cross-references: max 15 pts
      const refs = crossRefCounts.get(doc.frontmatter.id) ?? 0;
      if (refs > 0) {
        const crossRefPts = Math.min(15, refs * 5);
        signals.push({ factor: "cross-references", points: crossRefPts });
        score += crossRefPts;
      }

      return {
        id: doc.frontmatter.id,
        title: doc.frontmatter.title,
        type: doc.frontmatter.type,
        status: doc.frontmatter.status,
        score,
        signals,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  return { dueSoonActions, dueSoonSprintTasks, trending };
}

export function getSprintSummaryData(
  store: DocumentStore,
  sprintId?: string,
): SprintSummaryData | null {
  return collectSprintSummaryData(store, sprintId);
}

// ========================================================================
// Artifact Relationship Graph + Lineage Timeline data
// ========================================================================

export interface RelatedArtifact {
  id: string;
  title: string;
  type: string;
  status: string;
  relationship: string;
}

export interface ArtifactRelationships {
  origins: RelatedArtifact[];
  parents: RelatedArtifact[];
  self: RelatedArtifact;
  children: RelatedArtifact[];
  external: RelatedArtifact[];
  edges: { from: string; to: string }[];
}

export interface LineageEvent {
  date: string;
  type: "created" | "source-linked" | "child-spawned" | "assessment" | "jira-sync";
  label: string;
  relatedId?: string;
}

const SIBLING_CAP = 8;
const ARTIFACT_ID_PATTERN = /\b([A-Z]{1,3}-\d{3,})\b/g;

export function getArtifactRelationships(
  store: DocumentStore,
  docId: string,
): ArtifactRelationships | null {
  const doc = store.get(docId);
  if (!doc) return null;

  const fm = doc.frontmatter;
  const allDocs = store.list();
  const docIndex = new Map(allDocs.map(d => [d.frontmatter.id, d]));

  const origins: RelatedArtifact[] = [];
  const parents: RelatedArtifact[] = [];
  const children: RelatedArtifact[] = [];
  const external: RelatedArtifact[] = [];
  const edges: { from: string; to: string }[] = [];
  const seen = new Set<string>([docId]);

  const addIfExists = (
    id: string,
    relationship: string,
    bucket: RelatedArtifact[],
  ): boolean => {
    if (seen.has(id)) return false;
    const target = docIndex.get(id);
    if (!target) return false;
    seen.add(id);
    bucket.push({
      id: target.frontmatter.id,
      title: target.frontmatter.title,
      type: target.frontmatter.type,
      status: target.frontmatter.status,
      relationship,
    });
    return true;
  };

  // --- Parents (upward) ---
  // aboutArtifact → direct parent
  const parentId = fm.aboutArtifact as string | undefined;
  if (parentId && addIfExists(parentId, "parent", parents)) {
    edges.push({ from: parentId, to: docId });
  }

  // linkedEpic → epic(s)
  const linkedEpics = normalizeLinkedEpics(fm.linkedEpic);
  for (const epicId of linkedEpics) {
    if (addIfExists(epicId, "epic", parents)) {
      edges.push({ from: epicId, to: docId });
    }
    // Follow epic → feature
    const epicDoc = docIndex.get(epicId);
    if (epicDoc) {
      const features = normalizeLinkedFeatures(epicDoc.frontmatter.linkedFeature);
      for (const fid of features) {
        if (addIfExists(fid, "feature", parents)) {
          edges.push({ from: fid, to: epicId });
        }
      }
    }
  }

  // sprint: tags → sprint docs
  const tags = (fm.tags as string[]) ?? [];
  for (const tag of tags) {
    if (tag.startsWith("sprint:")) {
      const sprintId = tag.slice(7);
      if (addIfExists(sprintId, "sprint", parents)) {
        edges.push({ from: sprintId, to: docId });
      }
    }
  }

  // --- Origins (what caused this artifact to exist) ---
  for (const tag of tags) {
    if (tag.startsWith("source:")) {
      const sourceId = tag.slice(7);
      if (addIfExists(sourceId, "source", origins)) {
        edges.push({ from: sourceId, to: docId });
      }
    }
  }
  // source field (may reference meeting)
  const sourceField = fm.source as string | undefined;
  if (sourceField && /^[A-Z]{1,3}-\d{3,}$/.test(sourceField)) {
    if (addIfExists(sourceField, "source", origins)) {
      edges.push({ from: sourceField, to: docId });
    }
  }

  // --- Children (downward) ---
  for (const d of allDocs) {
    if (d.frontmatter.aboutArtifact === docId) {
      if (addIfExists(d.frontmatter.id, "child", children)) {
        edges.push({ from: docId, to: d.frontmatter.id });
      }
    }
  }

  // For epics: actions/tasks linked via linkedEpic or epic: tag
  if (fm.type === "epic") {
    const epicTag = `epic:${docId}`;
    for (const d of allDocs) {
      const dfm = d.frontmatter;
      const dLinkedEpics = normalizeLinkedEpics(dfm.linkedEpic);
      const dTags = (dfm.tags as string[]) ?? [];
      if (dLinkedEpics.includes(docId) || dTags.includes(epicTag)) {
        if (addIfExists(dfm.id, "child", children)) {
          edges.push({ from: docId, to: dfm.id });
        }
      }
    }
  }

  // --- Siblings (other children of the same parent, capped) ---
  if (parentId) {
    let siblingCount = 0;
    for (const d of allDocs) {
      if (siblingCount >= SIBLING_CAP) break;
      if (d.frontmatter.aboutArtifact === parentId && d.frontmatter.id !== docId) {
        if (addIfExists(d.frontmatter.id, "sibling", children)) {
          edges.push({ from: parentId, to: d.frontmatter.id });
          siblingCount++;
        }
      }
    }
  }

  // --- External (Jira) ---
  const jiraKey = fm.jiraKey as string | undefined;
  const jiraUrl = fm.jiraUrl as string | undefined;
  if (jiraKey) {
    external.push({
      id: jiraKey,
      title: jiraUrl ?? `Jira: ${jiraKey}`,
      type: "jira",
      status: "",
      relationship: "jira",
    });
    edges.push({ from: docId, to: jiraKey });
  }

  // --- Content cross-references ---
  if (doc.content) {
    const matches = doc.content.matchAll(ARTIFACT_ID_PATTERN);
    for (const m of matches) {
      const refId = m[1];
      if (refId !== docId && docIndex.has(refId)) {
        if (addIfExists(refId, "mentioned", external)) {
          edges.push({ from: docId, to: refId });
        }
      }
    }
  }

  return {
    origins,
    parents,
    self: {
      id: fm.id,
      title: fm.title,
      type: fm.type,
      status: fm.status,
      relationship: "self",
    },
    children,
    external,
    edges,
  };
}

export function getArtifactLineageEvents(
  store: DocumentStore,
  docId: string,
): LineageEvent[] {
  const doc = store.get(docId);
  if (!doc) return [];

  const fm = doc.frontmatter;
  const events: LineageEvent[] = [];

  // Created
  if (fm.created) {
    events.push({
      date: fm.created,
      type: "created",
      label: `${fm.id} created`,
    });
  }

  // Source origins
  const tags = (fm.tags as string[]) ?? [];
  for (const tag of tags) {
    if (tag.startsWith("source:")) {
      const sourceId = tag.slice(7);
      const sourceDoc = store.get(sourceId);
      if (sourceDoc) {
        events.push({
          date: sourceDoc.frontmatter.created,
          type: "source-linked",
          label: `Originated from ${sourceId} — ${sourceDoc.frontmatter.title}`,
          relatedId: sourceId,
        });
      }
    }
  }

  // Children spawned
  const allDocs = store.list();
  for (const d of allDocs) {
    if (d.frontmatter.aboutArtifact === docId) {
      events.push({
        date: d.frontmatter.created,
        type: "child-spawned",
        label: `Spawned ${d.frontmatter.type} ${d.frontmatter.id} — ${d.frontmatter.title}`,
        relatedId: d.frontmatter.id,
      });
    }
  }

  // For epics: actions/tasks linked via linkedEpic
  if (fm.type === "epic") {
    const epicTag = `epic:${docId}`;
    for (const d of allDocs) {
      if (d.frontmatter.aboutArtifact === docId) continue; // already counted
      const dLinkedEpics = normalizeLinkedEpics(d.frontmatter.linkedEpic);
      const dTags = (d.frontmatter.tags as string[]) ?? [];
      if (dLinkedEpics.includes(docId) || dTags.includes(epicTag)) {
        events.push({
          date: d.frontmatter.created,
          type: "child-spawned",
          label: `Linked ${d.frontmatter.type} ${d.frontmatter.id} — ${d.frontmatter.title}`,
          relatedId: d.frontmatter.id,
        });
      }
    }
  }

  // Assessment history
  const history = (fm.assessmentHistory as Array<{ generatedAt: string }>) ?? [];
  for (const entry of history) {
    if (entry.generatedAt) {
      events.push({
        date: entry.generatedAt,
        type: "assessment",
        label: "Assessment performed",
      });
    }
  }

  // Jira sync
  const lastSync = fm.lastJiraSyncAt as string | undefined;
  if (lastSync) {
    events.push({
      date: lastSync,
      type: "jira-sync",
      label: `Synced with Jira ${fm.jiraKey ?? ""}`,
    });
  }

  // Sort newest first
  events.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return events;
}
