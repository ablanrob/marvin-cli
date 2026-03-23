import type { OverviewData, DiagramDataResult } from "../../data.js";
import type { NavGroup } from "../layout.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge, typeLabel, jiraIcon } from "../layout.js";
import { buildArtifactFlowchart } from "../mermaid.js";

function renderCard(t: { type: string; total: number; open: number }): string {
  return `
      <div class="card">
        <a href="/docs/${t.type}">
          <div class="card-label">${escapeHtml(typeLabel(t.type))}s</div>
          <div class="card-value">${t.total}</div>
          ${t.open > 0 ? `<div class="card-sub">${t.open} open</div>` : `<div class="card-sub">none open</div>`}
        </a>
      </div>`;
}

export function overviewPage(data: OverviewData, diagrams: DiagramDataResult, navGroups: NavGroup[]): string {
  const typeMap = new Map(data.types.map((t) => [t.type, t]));
  const placed = new Set<string>();

  // Build grouped card sections from navGroups
  const groupSections = navGroups
    .map((group) => {
      const groupCards = group.types
        .filter((type) => typeMap.has(type))
        .map((type) => {
          placed.add(type);
          return renderCard(typeMap.get(type)!);
        });
      if (groupCards.length === 0) return "";
      return `
      <div class="card-group">
        <div class="card-group-label">${escapeHtml(group.label)}</div>
        <div class="cards">${groupCards.join("\n")}</div>
      </div>`;
    })
    .filter(Boolean)
    .join("\n");

  // Any types not covered by navGroups (shouldn't happen, but defensive)
  const ungrouped = data.types.filter((t) => !placed.has(t.type));
  const ungroupedSection =
    ungrouped.length > 0
      ? `
      <div class="card-group">
        <div class="card-group-label">Other</div>
        <div class="cards">${ungrouped.map(renderCard).join("\n")}</div>
      </div>`
      : "";

  const rows = data.recent
    .map(
      (doc) => `
        <tr>
          <td><a href="/docs/${doc.frontmatter.type}/${doc.frontmatter.id}">${escapeHtml(doc.frontmatter.id)}</a></td>
          <td>${escapeHtml(doc.frontmatter.title)}${jiraIcon(doc.frontmatter.jiraKey as string | undefined, doc.frontmatter.jiraUrl as string | undefined)}</td>
          <td>${escapeHtml(typeLabel(doc.frontmatter.type))}</td>
          <td>${statusBadge(doc.frontmatter.status)}</td>
          <td>${formatDate(doc.frontmatter.updated ?? doc.frontmatter.created)}</td>
        </tr>`,
    )
    .join("\n");

  return `
    <div class="page-header">
      <h2>Project Overview</h2>
    </div>

    ${groupSections}
    ${ungroupedSection}

    <div class="section-title"><a href="/timeline">Project Timeline &rarr;</a></div>

    ${collapsibleSection("overview-relationships", "Artifact Relationships", buildArtifactFlowchart(diagrams))}

    ${collapsibleSection(
      "overview-recent",
      "Recent Activity",
      data.recent.length > 0
        ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Type</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`
        : `<div class="empty"><p>No documents yet.</p></div>`,
    )}
  `;
}
