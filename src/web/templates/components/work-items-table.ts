import type { SprintWorkItem } from "../../../reports/sprint-summary/types.js";
import { collapsibleSection, escapeHtml, statusBadge, jiraIcon, confluenceIcon } from "../layout.js";

const FOCUS_BORDER_PALETTE = [
  "hsl(220, 60%, 55%)",
  "hsl(160, 50%, 45%)",
  "hsl(280, 45%, 55%)",
  "hsl(30, 65%, 55%)",
  "hsl(340, 50%, 55%)",
  "hsl(190, 50%, 45%)",
  "hsl(60, 50%, 50%)",
  "hsl(120, 40%, 45%)",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const DONE_STATUS_SET = new Set(["done", "closed", "resolved", "decided"]);
const DEFAULT_WEIGHT = 3;

function countFocusStats(items: SprintWorkItem[]): { total: number; done: number; inProgress: number; weightedProgress: number } {
  let total = 0;
  let done = 0;
  let inProgress = 0;
  let totalWeight = 0;
  let weightedSum = 0;
  // Count children for done/inProgress stats, but use only root items for weighted progress
  // (matches assessSprintProgress which uses root items to avoid double-counting)
  function walkStats(list: SprintWorkItem[]) {
    for (const w of list) {
      if (w.type !== "contribution") {
        total++;
        const s = w.status.toLowerCase();
        if (DONE_STATUS_SET.has(s)) done++;
        else if (s === "in-progress" || s === "in progress") inProgress++;
      }
      if (w.children) walkStats(w.children);
    }
  }
  walkStats(items);
  // Weighted progress from root items only (children are already rolled into parent progress)
  for (const w of items) {
    if (w.type === "contribution") continue;
    const weight = w.weight ?? DEFAULT_WEIGHT;
    const progress = w.progress ?? (DONE_STATUS_SET.has(w.status.toLowerCase()) ? 100 : 0);
    totalWeight += weight;
    weightedSum += weight * progress;
  }
  return { total, done, inProgress, weightedProgress: totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0 };
}

const KNOWN_OWNERS = new Set(["po", "tl", "dm"]);

function ownerBadge(owner?: string): string {
  if (!owner) return '<span class="text-dim">—</span>';
  const cls = KNOWN_OWNERS.has(owner) ? `owner-badge-${owner}` : "owner-badge-other";
  return `<span class="owner-badge ${cls}">${escapeHtml(owner.toUpperCase())}</span>`;
}

function renderItemRows(items: SprintWorkItem[], borderColor: string, showOwner: boolean, depth = 0): string[] {
  return items.flatMap((w) => {
    const isChild = depth > 0;
    const isContribution = w.type === "contribution";
    const classes = ["focus-row"];
    if (isContribution) classes.push("contribution-row");
    else if (isChild) classes.push("child-row");
    const indent = depth > 0 ? ` style="padding-left: ${0.75 + depth * 1}rem"` : "";
    const progressCell = !isContribution && w.progress !== undefined
      ? `<div class="mini-progress-bar"><div class="mini-progress-fill" style="width:${w.progress}%"></div><span class="mini-progress-label">${w.progress}%</span></div>`
      : "";
    const ownerCell = showOwner ? `<td>${ownerBadge(w.owner)}</td>` : "";
    const row = `
              <tr class="${classes.join(" ")}" style="--focus-color: ${borderColor}">
                <td${indent}><a href="/docs/${escapeHtml(w.type)}/${escapeHtml(w.id)}">${escapeHtml(w.id)}</a></td>
                <td>${escapeHtml(w.title)}${jiraIcon(w.jiraKey, w.jiraUrl)}${confluenceIcon(w.confluenceUrl, w.confluenceTitle)}</td>
                ${ownerCell}
                <td>${statusBadge(w.status)}</td>
                <td>${progressCell}</td>
              </tr>`;
    const childRows = w.children ? renderItemRows(w.children, borderColor, showOwner, depth + 1) : [];
    return [row, ...childRows];
  });
}

/**
 * Render a focus-grouped work items table with hierarchy, progress bars, and color-coded groups.
 */
export function renderWorkItemsTable(
  items: SprintWorkItem[],
  options?: { sectionId?: string; title?: string; defaultCollapsed?: boolean; showOwner?: boolean },
): string {
  const sectionId = options?.sectionId ?? "work-items";
  const title = options?.title ?? "Work Items";
  const defaultCollapsed = options?.defaultCollapsed ?? false;
  const showOwner = options?.showOwner ?? false;

  // Group root items by focus, preserving hierarchy
  const focusGroups = new Map<string, SprintWorkItem[]>();
  for (const item of items) {
    const focus = item.workFocus ?? "Unassigned";
    if (!focusGroups.has(focus)) focusGroups.set(focus, []);
    focusGroups.get(focus)!.push(item);
  }

  // Assign a border color to each focus
  const focusColorMap = new Map<string, string>();
  for (const name of focusGroups.keys()) {
    focusColorMap.set(name, FOCUS_BORDER_PALETTE[hashString(name) % FOCUS_BORDER_PALETTE.length]);
  }

  // Build all rows grouped by focus with group header rows
  const allWorkItemRows: string[] = [];
  for (const [focus, groupItems] of focusGroups) {
    const color = focusColorMap.get(focus)!;
    const stats = countFocusStats(groupItems);
    const pct = stats.weightedProgress;
    const summaryParts: string[] = [];
    if (stats.done > 0) summaryParts.push(`${stats.done} done`);
    if (stats.inProgress > 0) summaryParts.push(`${stats.inProgress} in progress`);
    const remaining = stats.total - stats.done - stats.inProgress;
    if (remaining > 0) summaryParts.push(`${remaining} open`);

    const leftColspan = showOwner ? 3 : 2;
    allWorkItemRows.push(`
              <tr class="focus-group-header" style="--focus-color: ${color}">
                <td colspan="${leftColspan}">
                  <span class="focus-group-name">${escapeHtml(focus)}</span>
                  <span class="focus-group-stats">${summaryParts.join(" / ")}</span>
                </td>
                <td colspan="2">
                  <div class="mini-progress-bar focus-group-progress"><div class="mini-progress-fill" style="width:${pct}%"></div><span class="mini-progress-label">${pct}%</span></div>
                </td>
              </tr>`);
    allWorkItemRows.push(...renderItemRows(groupItems, color, showOwner));
  }

  if (allWorkItemRows.length === 0) return "";

  const ownerHeader = showOwner ? "<th>Owner</th>" : "";

  return collapsibleSection(
    sectionId,
    title,
    `<div class="table-wrap">
          <table id="${sectionId}-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                ${ownerHeader}
                <th>Status</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              ${allWorkItemRows.join("")}
            </tbody>
          </table>
        </div>`,
    { titleTag: "h3", defaultCollapsed },
  );
}

const DONE_STATUSES = new Set(["done", "closed", "resolved", "cancelled", "decided"]);

/**
 * Compute average progress for primary (non-contribution) items matching the given owner.
 * Walks the items tree recursively.
 */
export function computeOwnerCompletionPct(items: SprintWorkItem[], owner: string): number {
  let total = 0;
  let progressSum = 0;

  function walk(list: SprintWorkItem[]) {
    for (const w of list) {
      if (w.type !== "contribution" && w.owner === owner) {
        total++;
        progressSum += w.progress ?? (DONE_STATUSES.has(w.status) ? 100 : 0);
      }
      if (w.children) walk(w.children);
    }
  }

  walk(items);
  return total > 0 ? Math.round(progressSum / total) : 0;
}

/**
 * Filter work items tree to only items owned by a specific persona.
 * Keeps items where owner matches; promotes children of excluded parents to top-level.
 */
export function filterItemsByOwner(items: SprintWorkItem[], owner: string): SprintWorkItem[] {
  const result: SprintWorkItem[] = [];
  for (const item of items) {
    if (item.owner === owner) {
      // Include this item with its full subtree
      result.push(item);
    } else if (item.children) {
      // Parent excluded — promote matching children
      result.push(...filterItemsByOwner(item.children, owner));
    }
  }
  return result;
}
