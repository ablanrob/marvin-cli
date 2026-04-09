import type { Document } from "../../../../storage/types.js";
import type { PersonaPageContext } from "../../../persona-views.js";
import {
  collapsibleSection,
  escapeHtml,
  formatDate,
  ownerBadge,
  statusBadge,
  typeLabel,
} from "../../layout.js";
import {
  renderTableUtilsScript,
  sortableTh,
  tableFilter,
  tableDateFilter,
} from "../../table-utils.js";

/** Decision statuses that indicate the decision has been resolved */
const RESOLVED_STATUSES = new Set(["decided", "superseded", "dismissed"]);

export function poDecisionsPage(ctx: PersonaPageContext): string {
  const decisions = ctx.store.list({ type: "decision" });
  const questions = ctx.store.list({ type: "question" });
  const features = ctx.store.list({ type: "feature" });

  const openDecisions = decisions.filter((d) => !RESOLVED_STATUSES.has(d.frontmatter.status));
  const resolvedDecisions = decisions.filter((d) => RESOLVED_STATUSES.has(d.frontmatter.status));
  const openQuestions = questions.filter((d) => d.frontmatter.status === "open");

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Open Decisions</div>
        <div class="card-value${openDecisions.length > 0 ? " priority-medium" : ""}">${openDecisions.length}</div>
        <div class="card-sub">awaiting resolution</div>
      </div>
      <div class="card">
        <div class="card-label">Resolved</div>
        <div class="card-value">${resolvedDecisions.length}</div>
        <div class="card-sub">decisions made</div>
      </div>
      <div class="card">
        <div class="card-label">Open Questions</div>
        <div class="card-value${openQuestions.length > 0 ? " priority-medium" : ""}">${openQuestions.length}</div>
        <div class="card-sub">needing answers</div>
      </div>
      <div class="card">
        <div class="card-label">Total</div>
        <div class="card-value">${decisions.length}</div>
        <div class="card-sub">all decisions</div>
      </div>
    </div>`;

  // ── Feature-grouped open decisions & questions ────────────────
  interface DepItem {
    doc: Document;
    docType: "decision" | "question";
    ageDays: number;
  }

  function daysSince(isoDate: string): number {
    if (!isoDate) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000));
  }

  const featureGroups = new Map<string, DepItem[]>();
  const unlinked: DepItem[] = [];

  function addToGroup(doc: Document, docType: "decision" | "question") {
    const tags = (doc.frontmatter.tags as string[]) ?? [];
    const featureTags = tags.filter((t) => t.startsWith("feature:")).map((t) => t.slice(8));
    const item: DepItem = { doc, docType, ageDays: daysSince(doc.frontmatter.created) };
    if (featureTags.length === 0) {
      unlinked.push(item);
    } else {
      for (const fid of featureTags) {
        const arr = featureGroups.get(fid) ?? [];
        arr.push(item);
        featureGroups.set(fid, arr);
      }
    }
  }

  for (const d of openDecisions) addToGroup(d, "decision");
  for (const q of openQuestions) addToGroup(q, "question");

  const totalDeps = openDecisions.length + openQuestions.length;
  const featureLookup = new Map(features.map((f) => [f.frontmatter.id, f]));

  function renderDepRows(items: DepItem[]): string {
    return items
      .map(
        (item) => `
            <tr>
              <td><a href="/docs/${item.docType}/${escapeHtml(item.doc.frontmatter.id)}">${escapeHtml(item.doc.frontmatter.id)}</a></td>
              <td>${escapeHtml(item.doc.frontmatter.title)}</td>
              <td>${escapeHtml(typeLabel(item.docType))}</td>
              <td>${ownerBadge(item.doc.frontmatter.owner)}</td>
              <td>${item.ageDays}d</td>
            </tr>`,
      )
      .join("");
  }

  let depRows = "";
  for (const [fid, items] of featureGroups) {
    const feat = featureLookup.get(fid);
    const label = feat
      ? `${escapeHtml(fid)}: ${escapeHtml(feat.frontmatter.title)}`
      : escapeHtml(fid);
    depRows += `
            <tr class="group-header-row"><td colspan="5"><strong>${label}</strong></td></tr>
            ${renderDepRows(items)}`;
  }
  if (unlinked.length > 0) {
    depRows += `
            <tr class="group-header-row"><td colspan="5"><strong>Unlinked</strong></td></tr>
            ${renderDepRows(unlinked)}`;
  }

  const depsSection =
    totalDeps > 0
      ? collapsibleSection(
          "po-decisions-deps",
          `By Feature (${totalDeps})`,
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Type</th><th>Owner</th><th>Age</th></tr>
            </thead>
            <tbody>
              ${depRows}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3" },
        )
      : "";

  // ── Standard decision tables ─────────────────────────────────
  function decisionTable(docs: typeof decisions, tableId: string): string {
    if (docs.length === 0) return '<div class="empty"><p>None found.</p></div>';

    const statuses = [...new Set(docs.map((d) => d.frontmatter.status))].sort();
    const owners = [
      ...new Set(docs.map((d) => d.frontmatter.owner).filter(Boolean) as string[]),
    ].sort();

    const filters = `<div class="filters">
      ${tableFilter(tableId, 2, "Status", statuses)}
      ${owners.length > 0 ? tableFilter(tableId, 3, "Owner", owners) : ""}
      ${tableDateFilter(tableId, 4)}
    </div>`;

    return `${filters}
    <div class="table-wrap table-short">
      <table id="${escapeHtml(tableId)}">
        <thead>
          <tr>${sortableTh("ID", tableId, 0)}${sortableTh("Title", tableId, 1)}${sortableTh("Status", tableId, 2)}${sortableTh("Owner", tableId, 3)}${sortableTh("Created", tableId, 4)}</tr>
        </thead>
        <tbody>
          ${docs
            .map(
              (d) => `
          <tr>
            <td><a href="/docs/decision/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
            <td>${escapeHtml(d.frontmatter.title)}</td>
            <td>${statusBadge(d.frontmatter.status)}</td>
            <td>${ownerBadge(d.frontmatter.owner)}</td>
            <td>${formatDate(d.frontmatter.created)}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  const openSection = collapsibleSection(
    "po-decisions-open",
    `Open Decisions (${openDecisions.length})`,
    decisionTable(openDecisions, "decisions-open-table"),
    { titleTag: "h3" },
  );

  const resolvedSection = collapsibleSection(
    "po-decisions-resolved",
    `Resolved Decisions (${resolvedDecisions.length})`,
    decisionTable(resolvedDecisions, "decisions-resolved-table"),
    { titleTag: "h3", defaultCollapsed: true },
  );

  return `
    <div class="page-header">
      <h2>Decision Log</h2>
      <div class="subtitle">Track and manage product decisions and dependencies</div>
    </div>
    ${statsCards}
    ${depsSection}
    ${openSection}
    ${resolvedSection}
    ${renderTableUtilsScript()}
  `;
}
