import type { Document } from "../../../storage/types.js";
import {
  escapeHtml,
  formatDate,
  statusBadge,
  typeLabel,
  renderMarkdown,
  jiraIcon,
} from "../layout.js";

export function documentDetailPage(doc: Document): string {
  const fm = doc.frontmatter;
  const label = typeLabel(fm.type);

  // Build frontmatter definition list (skip content-level fields)
  const skipKeys = new Set(["title", "type"]);
  const entries = Object.entries(fm).filter(
    ([key]) => !skipKeys.has(key) && fm[key] != null,
  );

  const dtDd = entries
    .map(([key, value]) => {
      let rendered: string;
      if (key === "status") {
        rendered = statusBadge(value as string);
      } else if (key === "tags" && Array.isArray(value)) {
        rendered = (value as string[]).map((t) => `<span class="badge badge-default">${escapeHtml(t)}</span>`).join(" ");
      } else if (key === "created" || key === "updated") {
        rendered = formatDate(value as string);
      } else {
        rendered = escapeHtml(String(value));
      }
      return `<dt>${escapeHtml(key)}</dt><dd>${rendered}</dd>`;
    })
    .join("\n        ");

  return `
    <div class="breadcrumb">
      <a href="/">Overview</a><span class="sep">/</span>
      <a href="/docs/${fm.type}">${escapeHtml(label)}s</a><span class="sep">/</span>
      ${escapeHtml(fm.id)}
    </div>

    <div class="page-header">
      <h2>${escapeHtml(fm.title)}${jiraIcon(fm.jiraKey as string | undefined, fm.jiraUrl as string | undefined)}</h2>
      <div class="subtitle">${escapeHtml(fm.id)} &middot; ${escapeHtml(label)}</div>
    </div>

    <div class="detail-meta">
      <dl>
        ${dtDd}
      </dl>
    </div>

    ${
      doc.content.trim()
        ? `<div class="detail-content">${renderMarkdown(doc.content)}</div>`
        : ""
    }
  `;
}
