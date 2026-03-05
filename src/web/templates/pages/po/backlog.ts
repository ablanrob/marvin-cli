import type { PersonaPageContext } from "../../../persona-views.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge } from "../../layout.js";
import { renderTableUtilsScript, sortableTh, tableFilter } from "../../table-utils.js";

export function poBacklogPage(ctx: PersonaPageContext): string {
  const features = ctx.store.list({ type: "feature" });
  const questions = ctx.store.list({ type: "question" });
  const openQuestions = questions.filter((d) => d.frontmatter.status === "open");

  // Sort features: open/in-progress first, then by priority, then by ID
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const statusOrder: Record<string, number> = { "in-progress": 0, open: 1, draft: 2, blocked: 3, done: 4, closed: 5, resolved: 6 };

  const sortedFeatures = [...features].sort((a, b) => {
    const sa = statusOrder[a.frontmatter.status] ?? 3;
    const sb = statusOrder[b.frontmatter.status] ?? 3;
    if (sa !== sb) return sa - sb;
    const pa = priorityOrder[(a.frontmatter.priority as string)?.toLowerCase()] ?? 99;
    const pb = priorityOrder[(b.frontmatter.priority as string)?.toLowerCase()] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.frontmatter.id.localeCompare(b.frontmatter.id);
  });

  // Link epics to features
  const epics = ctx.store.list({ type: "epic" });
  const featureToEpics = new Map<string, string[]>();
  for (const epic of epics) {
    const linked = epic.frontmatter.linkedFeature;
    const featureIds = Array.isArray(linked) ? linked : linked ? [linked] : [];
    for (const fid of featureIds) {
      const existing = featureToEpics.get(String(fid)) ?? [];
      existing.push(epic.frontmatter.id);
      featureToEpics.set(String(fid), existing);
    }
  }

  function priorityClass(p?: string): string {
    if (!p) return "";
    const lower = p.toLowerCase();
    if (lower === "critical" || lower === "high") return " priority-high";
    if (lower === "medium") return " priority-medium";
    if (lower === "low") return " priority-low";
    return "";
  }

  // Unique filter values
  const featureStatuses = [...new Set(features.map((d) => d.frontmatter.status))].sort();
  const featurePriorities = [...new Set(features.map((d) => (d.frontmatter.priority as string) ?? "").filter(Boolean))].sort();
  const featureEpicIds = [...new Set(
    features.flatMap((d) => featureToEpics.get(d.frontmatter.id) ?? []),
  )].sort();

  const featuresFilters = `<div class="filters">
    ${tableFilter("features-table", 2, "Status", featureStatuses)}
    ${tableFilter("features-table", 3, "Priority", featurePriorities)}
    ${featureEpicIds.length > 0 ? tableFilter("features-table", 4, "Epic", featureEpicIds) : ""}
  </div>`;

  const featuresTable = sortedFeatures.length > 0
    ? `${featuresFilters}
      <div class="table-wrap table-short">
        <table id="features-table">
          <thead>
            <tr>${sortableTh("ID", "features-table", 0)}${sortableTh("Title", "features-table", 1)}${sortableTh("Status", "features-table", 2)}${sortableTh("Priority", "features-table", 3)}<th>Linked Epics</th></tr>
          </thead>
          <tbody>
            ${sortedFeatures.map((d) => {
              const linkedEpics = featureToEpics.get(d.frontmatter.id) ?? [];
              const epicLinks = linkedEpics
                .map((eid) => `<a href="/docs/epic/${escapeHtml(eid)}">${escapeHtml(eid)}</a>`)
                .join(", ");
              return `
            <tr>
              <td><a href="/docs/feature/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
              <td>${escapeHtml(d.frontmatter.title)}</td>
              <td>${statusBadge(d.frontmatter.status)}</td>
              <td><span class="${priorityClass(d.frontmatter.priority as string)}">${escapeHtml((d.frontmatter.priority as string) ?? "—")}</span></td>
              <td>${epicLinks || '<span class="text-dim">—</span>'}</td>
            </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`
    : '<div class="empty"><p>No features found.</p></div>';

  // Question owners for filter
  const questionOwners = [...new Set(openQuestions.map((d) => d.frontmatter.owner).filter(Boolean) as string[])].sort();

  const questionsTable = openQuestions.length > 0
    ? collapsibleSection(
        "po-backlog-questions",
        `Open Questions (${openQuestions.length})`,
        `${questionOwners.length > 0 ? `<div class="filters">${tableFilter("questions-table", 2, "Owner", questionOwners)}</div>` : ""}
        <div class="table-wrap table-short">
          <table id="questions-table">
            <thead>
              <tr>${sortableTh("ID", "questions-table", 0)}${sortableTh("Title", "questions-table", 1)}${sortableTh("Owner", "questions-table", 2)}${sortableTh("Created", "questions-table", 3)}</tr>
            </thead>
            <tbody>
              ${openQuestions.map((d) => `
              <tr>
                <td><a href="/docs/question/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${d.frontmatter.owner ? escapeHtml(d.frontmatter.owner) : '<span class="text-dim">—</span>'}</td>
                <td>${formatDate(d.frontmatter.created)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  return `
    <div class="page-header">
      <h2>Product Backlog</h2>
      <div class="subtitle">${features.length} features, ${openQuestions.length} open questions</div>
    </div>
    ${collapsibleSection("po-backlog-features", `Features (${features.length})`, featuresTable, { titleTag: "h3" })}
    ${questionsTable}
    ${renderTableUtilsScript()}
  `;
}
