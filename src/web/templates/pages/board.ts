import type { BoardData } from "../../data.js";
import { escapeHtml, typeLabel } from "../layout.js";

export function boardPage(data: BoardData, basePath = "/board"): string {
  const typeOptions = data.types
    .map(
      (t) =>
        `<option value="${escapeHtml(t)}"${data.type === t ? " selected" : ""}>${escapeHtml(typeLabel(t))}s</option>`,
    )
    .join("");

  const columns = data.columns
    .map(
      (col) => `
      <div class="board-column">
        <div class="board-column-header">
          <span>${escapeHtml(col.status)}</span>
          <span class="count">${col.docs.length}</span>
        </div>
        <div class="board-column-cards">
        ${col.docs
          .map(
            (doc) => `
          <div class="board-card">
            <a href="/docs/${doc.frontmatter.type}/${doc.frontmatter.id}">
              <div class="bc-id">${escapeHtml(doc.frontmatter.id)}</div>
              <div class="bc-title">${escapeHtml(doc.frontmatter.title)}</div>
              ${doc.frontmatter.owner ? `<div class="bc-owner">${escapeHtml(doc.frontmatter.owner)}</div>` : ""}
            </a>
          </div>`,
          )
          .join("\n")}
        </div>
      </div>`,
    )
    .join("\n");

  return `
    <div class="page-header">
      <h2>Status Board</h2>
    </div>

    <div class="filters">
      <select onchange="filterByType(this.value)">
        <option value="">All types</option>
        ${typeOptions}
      </select>
    </div>

    ${
      data.columns.length > 0
        ? `<div class="board">${columns}</div>`
        : `<div class="empty"><p>No documents to display.</p></div>`
    }

    <script>
      function filterByType(type) {
        var base = '${escapeHtml(basePath)}';
        if (type) window.location = base + '/' + type;
        else window.location = base;
      }
    </script>
  `;
}
