import type { DocumentListData } from "../../data.js";
import { escapeHtml, formatDate, statusBadge, typeLabel } from "../layout.js";

export function documentsPage(data: DocumentListData): string {
  const label = typeLabel(data.type);

  const statusOptions = data.statuses
    .map(
      (s) =>
        `<option value="${escapeHtml(s)}"${data.filterStatus === s ? " selected" : ""}>${escapeHtml(s)}</option>`,
    )
    .join("");

  const ownerOptions = data.owners
    .map(
      (o) =>
        `<option value="${escapeHtml(o)}"${data.filterOwner === o ? " selected" : ""}>${escapeHtml(o)}</option>`,
    )
    .join("");

  const rows = data.docs
    .map(
      (doc) => `
        <tr>
          <td><a href="/docs/${data.type}/${doc.frontmatter.id}">${escapeHtml(doc.frontmatter.id)}</a></td>
          <td><a href="/docs/${data.type}/${doc.frontmatter.id}">${escapeHtml(doc.frontmatter.title)}</a></td>
          <td>${statusBadge(doc.frontmatter.status)}</td>
          <td>${escapeHtml(doc.frontmatter.owner ?? "—")}</td>
          <td>${doc.frontmatter.priority ? `<span class="priority-${doc.frontmatter.priority.toLowerCase()}">${escapeHtml(doc.frontmatter.priority)}</span>` : "—"}</td>
          <td>${formatDate(doc.frontmatter.updated ?? doc.frontmatter.created)}</td>
        </tr>`,
    )
    .join("\n");

  return `
    <div class="page-header">
      <h2>${escapeHtml(label)}s</h2>
      <div class="subtitle">${data.docs.length} document${data.docs.length !== 1 ? "s" : ""}</div>
    </div>

    <div class="filters">
      <select onchange="filterByStatus(this.value)">
        <option value="">All statuses</option>
        ${statusOptions}
      </select>
      <select onchange="filterByOwner(this.value)">
        <option value="">All owners</option>
        ${ownerOptions}
      </select>
    </div>

    ${
      data.docs.length > 0
        ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Priority</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`
        : `<div class="empty"><p>No ${label.toLowerCase()}s found.</p></div>`
    }

    <script>
      function filterByStatus(status) {
        const url = new URL(window.location);
        if (status) url.searchParams.set('status', status);
        else url.searchParams.delete('status');
        window.location = url;
      }
      function filterByOwner(owner) {
        const url = new URL(window.location);
        if (owner) url.searchParams.set('owner', owner);
        else url.searchParams.delete('owner');
        window.location = url;
      }
    </script>
  `;
}
