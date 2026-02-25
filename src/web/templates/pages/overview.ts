import type { OverviewData } from "../../data.js";
import { escapeHtml, formatDate, statusBadge, typeLabel } from "../layout.js";

export function overviewPage(data: OverviewData): string {
  const cards = data.types
    .map(
      (t) => `
      <div class="card">
        <a href="/docs/${t.type}">
          <div class="card-label">${escapeHtml(typeLabel(t.type))}s</div>
          <div class="card-value">${t.total}</div>
          ${t.open > 0 ? `<div class="card-sub">${t.open} open</div>` : `<div class="card-sub">none open</div>`}
        </a>
      </div>`,
    )
    .join("\n");

  const rows = data.recent
    .map(
      (doc) => `
        <tr>
          <td><a href="/docs/${doc.frontmatter.type}/${doc.frontmatter.id}">${escapeHtml(doc.frontmatter.id)}</a></td>
          <td>${escapeHtml(doc.frontmatter.title)}</td>
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

    <div class="cards">
      ${cards}
    </div>

    <div class="section-title">Recent Activity</div>
    ${
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
        : `<div class="empty"><p>No documents yet.</p></div>`
    }
  `;
}
