import type { DocumentStore } from "../storage/store.js";
import type { Document } from "../storage/types.js";
import { collectGarMetrics } from "../reports/gar/collector.js";
import { evaluateGar } from "../reports/gar/evaluator.js";
import type { GarReport } from "../reports/gar/types.js";

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
