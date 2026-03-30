import { CORE_ID_PREFIXES } from "../../storage/store.js";
import { COMMON_REGISTRATIONS } from "../../plugins/common.js";

/**
 * Wrap a section title + content in a collapsible container.
 * `sectionId` is used as a localStorage key to persist open/closed state.
 * Sections default to expanded.
 */
export function collapsibleSection(
  sectionId: string,
  title: string,
  content: string,
  opts?: { titleTag?: string; titleClass?: string; defaultCollapsed?: boolean },
): string {
  const tag = opts?.titleTag ?? "div";
  const cls = opts?.titleClass ?? "section-title";
  const collapsed = opts?.defaultCollapsed ? " collapsed" : "";
  return `
    <div class="collapsible${collapsed}" data-section-id="${escapeHtml(sectionId)}">
      <${tag} class="${cls} collapsible-header" onclick="toggleSection(this)">
        <svg class="collapsible-chevron" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M4.94 5.72a.75.75 0 0 1 1.06-.02L8 7.56l1.97-1.84a.75.75 0 1 1 1.02 1.1l-2.5 2.34a.75.75 0 0 1-1.02 0l-2.5-2.34a.75.75 0 0 1-.03-1.06z"/>
        </svg>
        <span>${title}</span>
      </${tag}>
      <div class="collapsible-body">
        ${content}
      </div>
    </div>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function statusBadge(status: string): string {
  const cls = {
    open: "badge-open",
    done: "badge-done",
    closed: "badge-done",
    resolved: "badge-resolved",
    decided: "badge-done",
    superseded: "badge-draft",
    dismissed: "badge-draft",
    "in-progress": "badge-in-progress",
    "in progress": "badge-in-progress",
    draft: "badge-draft",
    blocked: "badge-blocked",
  }[status.toLowerCase()] ?? "badge-default";
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function typeLabel(type: string): string {
  return type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Official Jira mark SVG (blue gradient)
const JIRA_SVG = `<svg class="integration-icon" viewBox="0 0 256 256" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="jg1" x1="98.03%" y1="0.16%" x2="58.89%" y2="40.87%"><stop offset="18%" stop-color="#0052CC"/><stop offset="100%" stop-color="#2684FF"/></linearGradient><linearGradient id="jg2" x1="100.17%" y1="0.05%" x2="55.76%" y2="45.19%"><stop offset="18%" stop-color="#0052CC"/><stop offset="100%" stop-color="#2684FF"/></linearGradient></defs><path d="M244.658 0H121.707a55.502 55.502 0 0 0 55.502 55.502h22.649V77.37c.02 30.625 24.841 55.447 55.466 55.502V10.666C255.324 4.777 250.55 0 244.658 0z" fill="#2684FF"/><path d="M183.822 61.262H60.872c.019 30.625 24.84 55.447 55.466 55.502h22.649v21.868c.02 30.597 24.798 55.408 55.395 55.502V71.928c0-5.891-4.776-10.666-10.56-10.666z" fill="url(#jg1)"/><path d="M122.951 122.489H0c0 30.653 24.85 55.502 55.502 55.502h22.72v21.868c.02 30.597 24.798 55.408 55.396 55.502V133.155c0-5.891-4.776-10.666-10.667-10.666z" fill="url(#jg2)"/></svg>`;

// Official Confluence mark SVG (blue gradient)
const CONFLUENCE_SVG = `<svg class="integration-icon" viewBox="0 0 256 246" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="cg1" x1="99.14%" y1="113.9%" x2="33.86%" y2="37.96%"><stop offset="18%" stop-color="#0052CC"/><stop offset="100%" stop-color="#2684FF"/></linearGradient><linearGradient id="cg2" x1="0.86%" y1="-13.9%" x2="66.14%" y2="62.04%"><stop offset="18%" stop-color="#0052CC"/><stop offset="100%" stop-color="#2684FF"/></linearGradient></defs><path d="M9.26 187.28c-3.14 5.06-6.71 10.98-9.26 15.53a7.84 7.84 0 0 0 2.83 10.72l67.58 40.48a7.85 7.85 0 0 0 10.72-2.63c2.14-3.54 5.01-8.25 8.15-13.41 22.18-36.47 44.67-32.02 85.83-13.41l68.59 31.05a7.85 7.85 0 0 0 10.42-3.94l29.24-66.24a7.85 7.85 0 0 0-3.84-10.32c-20.53-9.27-61.49-27.75-87.33-39.45-72.2-32.73-133.87-30.05-182.93 51.62z" fill="url(#cg1)"/><path d="M246.11 58.24c3.14-5.06 6.71-10.98 9.26-15.53a7.84 7.84 0 0 0-2.83-10.72L184.96 0a7.85 7.85 0 0 0-10.72 2.63c-2.14 3.54-5.01 8.25-8.15 13.41-22.18 36.47-44.67 32.02-85.83 13.41L12.37 -1.6a7.85 7.85 0 0 0-10.42 3.94L-27.29 68.58a7.85 7.85 0 0 0 3.84 10.32c20.53 9.27 61.49 27.75 87.33 39.45 72.2 32.73 133.87 30.05 182.23-60.11z" fill="url(#cg2)"/></svg>`;

/**
 * Render an inline Jira icon linking to the issue.
 * Returns empty string if no jiraKey provided.
 */
export function jiraIcon(jiraKey?: string, jiraUrl?: string): string {
  if (!jiraKey) return "";
  const href = jiraUrl ?? "#";
  const title = escapeHtml(jiraKey);
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" title="Jira: ${title}" class="integration-link jira-link">${JIRA_SVG}</a>`;
}

/**
 * Render an inline Confluence icon linking to the page.
 * Returns empty string if no confluenceUrl provided.
 */
export function confluenceIcon(confluenceUrl?: string, confluenceTitle?: string): string {
  if (!confluenceUrl) return "";
  const title = confluenceTitle ? escapeHtml(confluenceTitle) : "Confluence";
  return `<a href="${escapeHtml(confluenceUrl)}" target="_blank" rel="noopener" title="${title}" class="integration-link confluence-link">${CONFLUENCE_SVG}</a>`;
}

/**
 * Render all integration icons for an artifact (Jira + Confluence).
 */
export function integrationIcons(frontmatter: Record<string, unknown>): string {
  const jira = jiraIcon(
    frontmatter.jiraKey as string | undefined,
    frontmatter.jiraUrl as string | undefined,
  );
  const confluence = confluenceIcon(
    frontmatter.confluenceUrl as string | undefined,
    frontmatter.confluenceTitle as string | undefined,
  );
  if (!jira && !confluence) return "";
  return `<span class="integration-icons">${jira}${confluence}</span>`;
}

/** Minimal markdown → HTML (headings, paragraphs, lists, tables, hr, bold, italic, code) */
export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
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
      out.push("<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
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
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/_([^_]+)_/g, "<em>$1</em>");
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

export interface NavGroup {
  label: string;
  types: string[];
}

interface LayoutOptions {
  title: string;
  activePath: string;
  projectName: string;
  navGroups: NavGroup[];
  mainClass?: string;
  persona?: import("../persona-views.js").DashboardPersona;
  personaSwitcherHtml?: string;
  personaNavHtml?: string;
  personaAccentColor?: string;
  bodyPrefix?: string;
}

export function layout(opts: LayoutOptions, body: string): string {

  const switcherHtml = opts.personaSwitcherHtml ?? "";

  let navHtml: string;
  if (opts.personaNavHtml) {
    navHtml = opts.personaNavHtml;
  } else {
    // Minimal nav (persona picker page only)
    navHtml = `
        <a href="/" class="active">Home</a>`;
  }

  const accentOverride = opts.personaAccentColor
    ? ` style="--persona-accent: ${opts.personaAccentColor}"`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title)} — Marvin</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="shell"${accentOverride}>
    <aside class="sidebar">
      <div class="sidebar-brand">
        <h1>Marvin</h1>
        <div class="project-name">${escapeHtml(opts.projectName)}</div>
      </div>
      ${switcherHtml}
      <nav>
        ${navHtml}
      </nav>
    </aside>
    <main class="main${opts.mainClass ? ` ${opts.mainClass}` : ""}">
      <button class="expand-toggle" onclick="document.querySelector('.main').classList.toggle('expanded')" title="Toggle wide view">
        <svg class="icon-expand" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M1 1h5v1.5H3.56l3.72 3.72-1.06 1.06L2.5 3.56V6H1V1zm14 14h-5v-1.5h2.44l-3.72-3.72 1.06-1.06 3.72 3.72V10H15v5z"/></svg>
        <svg class="icon-collapse" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M6 7H1V5.5h2.44L0.22 2.28l1.06-1.06L4.5 4.44V2H6v5zm4-1h5v1.5h-2.44l3.22 3.22-1.06 1.06L11.5 8.56V11H10V6z"/></svg>
      </button>
      ${opts.bodyPrefix ?? ""}${body}
    </main>
  </div>
  <script>
    function toggleSection(header) {
      var section = header.closest('.collapsible');
      if (!section) return;
      section.classList.toggle('collapsed');
      var id = section.getAttribute('data-section-id');
      if (id) {
        try {
          var state = JSON.parse(localStorage.getItem('marvin-collapsed') || '{}');
          state[id] = section.classList.contains('collapsed');
          localStorage.setItem('marvin-collapsed', JSON.stringify(state));
        } catch(e) {}
      }
    }
    function toggleNavGroup(label) {
      var group = label.closest('.nav-group-collapsible');
      if (!group) return;
      group.classList.toggle('nav-collapsed');
      var key = group.getAttribute('data-nav-group');
      if (key) {
        try {
          var state = JSON.parse(localStorage.getItem('marvin-collapsed') || '{}');
          state['nav-' + key] = group.classList.contains('nav-collapsed');
          localStorage.setItem('marvin-collapsed', JSON.stringify(state));
        } catch(e) {}
      }
    }
    // Restore collapsed state on load
    (function() {
      try {
        var state = JSON.parse(localStorage.getItem('marvin-collapsed') || '{}');
        document.querySelectorAll('.collapsible[data-section-id]').forEach(function(el) {
          var id = el.getAttribute('data-section-id');
          if (state[id] === true) el.classList.add('collapsed');
          else if (state[id] === false) el.classList.remove('collapsed');
        });
        // Nav groups: restore state but force-expand if group contains an active link
        document.querySelectorAll('.nav-group-collapsible[data-nav-group]').forEach(function(el) {
          var key = 'nav-' + el.getAttribute('data-nav-group');
          var hasActive = el.querySelector('a.active');
          if (hasActive) {
            el.classList.remove('nav-collapsed');
          } else if (state[key] === true) {
            el.classList.add('nav-collapsed');
          } else if (state[key] === false) {
            el.classList.remove('nav-collapsed');
          }
        });
      } catch(e) {}
    })();
  </script>
  ${opts.persona ? `<script>
    // Preserve persona context on /docs/ links
    (function() {
      var persona = "${opts.persona}";
      document.addEventListener('click', function(e) {
        var a = e.target.closest('a');
        if (!a) return;
        var href = a.getAttribute('href');
        if (!href || !href.startsWith('/docs/')) return;
        if (href.indexOf('persona=') !== -1) return;
        var sep = href.indexOf('?') === -1 ? '?' : '&';
        a.setAttribute('href', href + sep + 'persona=' + persona);
      }, true);
    })();
  </script>` : ""}
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({
    startOnLoad: true,
    theme: 'dark',
    themeVariables: {
      background: '#1a1d27',
      primaryColor: '#2a2e3a',
      sectionBkgColor: '#1a1d27',
      sectionBkgColor2: '#222632',
      altSectionBkgColor: '#222632',
      gridColor: '#2a2e3a',
      taskBorderColor: '#475569',
      doneTaskBkgColor: '#065f46',
      doneTaskBorderColor: '#34d399',
      activeTaskBkgColor: '#78350f',
      activeTaskBorderColor: '#fbbf24',
      taskTextColor: '#e1e4ea',
      sectionBkgColor: '#1a1d27',
      pie1: '#34d399',
      pie2: '#475569',
      pie3: '#fbbf24',
      pie4: '#f87171',
      pie5: '#6c8cff',
      pie6: '#a78bfa',
      pie7: '#f472b6',
      pieTitleTextColor: '#e1e4ea',
      pieSectionTextColor: '#e1e4ea',
      pieLegendTextColor: '#e1e4ea',
      pieStrokeColor: '#1a1d27'
    }
  });</script>
</body>
</html>`;
}
