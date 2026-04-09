import { CORE_ID_PREFIXES } from "../../storage/store.js";
import { COMMON_REGISTRATIONS } from "../../plugins/common.js";
import { escapeHtml } from "./html-utils.js";

/** Minimal markdown → HTML (headings, paragraphs, lists, tables, hr, bold, italic, code) */
export function renderMarkdown(md: string): string {
  // Normalize literal \n sequences from agent-generated content
  const lines = md.replace(/\\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  let listTag = "ul";
  let inTable = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Close list if we leave a list context
    if (inList && !/^\s*[-*]\s/.test(line) && !/^\s*\d+\.\s/.test(line) && line.trim() !== "") {
      out.push(`</${listTag}>`);
      inList = false;
    }

    // Close table if we leave a table context
    if (inTable && !/^\s*\|/.test(line)) {
      out.push("</tbody></table></div>");
      inTable = false;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      i++;
      out.push("<hr>");
      continue;
    }

    // Table: detect header row followed by separator row
    if (
      !inTable &&
      /^\s*\|/.test(line) &&
      i + 1 < lines.length &&
      /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])
    ) {
      const headers = parseTableRow(line);
      out.push('<div class="table-wrap"><table><thead><tr>');
      out.push(headers.map((h) => `<th>${inline(h)}</th>`).join(""));
      out.push("</tr></thead><tbody>");
      inTable = true;
      i += 2; // skip header + separator
      continue;
    }

    // Table body row
    if (inTable && /^\s*\|/.test(line)) {
      const cells = parseTableRow(line);
      out.push(`<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list items
    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listTag !== "ul") {
        if (inList) out.push(`</${listTag}>`);
        out.push("<ul>");
        inList = true;
        listTag = "ul";
      }
      out.push(`<li>${inline(ulMatch[1])}</li>`);
      i++;
      continue;
    }

    // Ordered list items
    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listTag !== "ol") {
        if (inList) out.push(`</${listTag}>`);
        out.push("<ol>");
        inList = true;
        listTag = "ol";
      }
      out.push(`<li>${inline(olMatch[1])}</li>`);
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      if (inList) {
        out.push(`</${listTag}>`);
        inList = false;
      }
      i++;
      continue;
    }

    // Paragraph
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }

  if (inList) out.push(`</${listTag}>`);
  if (inTable) out.push("</tbody></table></div>");
  return out.join("\n");
}

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function inline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold first (** and __) so single delimiters don't match inside bold tokens
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italic: only match single delimiters not adjacent to another delimiter
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>");
  s = linkArtifactIds(s);
  return s;
}

/**
 * ID prefix → document type mapping for cross-linking.
 * Built from canonical registries (CORE_ID_PREFIXES + COMMON_REGISTRATIONS).
 * Sorted longest prefix first so "SP" matches before "S".
 */
const ID_PREFIX_TO_TYPE: Map<string, string> = (() => {
  const entries: [string, string][] = [];
  // Core types (D, A, Q)
  for (const [type, prefix] of Object.entries(CORE_ID_PREFIXES)) {
    entries.push([prefix, type]);
  }
  // Common registrations (T, E, SP, M, R, F, C)
  for (const reg of COMMON_REGISTRATIONS) {
    if (!entries.some(([p]) => p === reg.idPrefix)) {
      entries.push([reg.idPrefix, reg.type]);
    }
  }
  // Sort longest prefix first for correct regex matching
  entries.sort((a, b) => b[0].length - a[0].length);
  return new Map(entries);
})();

/**
 * Replace Marvin artifact IDs (e.g. T-045, A-191, SP-009) with clickable links.
 * Expects already-HTML-escaped input.
 */
export function linkArtifactIds(html: string): string {
  // Match patterns like T-001, A-151, SP-009, PRD-001, etc.
  return html.replace(/\b([A-Z]{1,3})-(\d{3,})\b/g, (match, prefix, num) => {
    const type = ID_PREFIX_TO_TYPE.get(prefix);
    if (!type) return match;
    const id = `${prefix}-${num}`;
    return `<a href="/docs/${type}/${id}" class="artifact-link">${match}</a>`;
  });
}
