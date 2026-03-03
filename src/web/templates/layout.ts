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
  return s;
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
}

export function layout(opts: LayoutOptions, body: string): string {
  const topItems = [
    { href: "/", label: "Overview" },
    { href: "/upcoming", label: "Upcoming" },
    { href: "/timeline", label: "Timeline" },
    { href: "/board", label: "Board" },
    { href: "/gar", label: "GAR Report" },
    { href: "/health", label: "Health" },
  ];

  const isActive = (href: string) =>
    opts.activePath === href || (href !== "/" && opts.activePath.startsWith(href))
      ? " active"
      : "";

  const groupsHtml = opts.navGroups
    .map((group) => {
      const links = group.types
        .map((type) => {
          const href = `/docs/${type}`;
          return `<a href="${href}" class="${isActive(href)}">${typeLabel(type)}s</a>`;
        })
        .join("\n          ");
      return `
        <div class="nav-group">
          <div class="nav-group-label">${escapeHtml(group.label)}</div>
          ${links}
        </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title)} — Marvin</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <h1>Marvin</h1>
        <div class="project-name">${escapeHtml(opts.projectName)}</div>
      </div>
      <nav>
        ${topItems.map((n) => `<a href="${n.href}" class="${isActive(n.href)}">${n.label}</a>`).join("\n        ")}
        ${groupsHtml}
      </nav>
    </aside>
    <main class="main${opts.mainClass ? ` ${opts.mainClass}` : ""}">
      <button class="expand-toggle" onclick="document.querySelector('.main').classList.toggle('expanded')" title="Toggle wide view">
        <svg class="icon-expand" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M1 1h5v1.5H3.56l3.72 3.72-1.06 1.06L2.5 3.56V6H1V1zm14 14h-5v-1.5h2.44l-3.72-3.72 1.06-1.06 3.72 3.72V10H15v5z"/></svg>
        <svg class="icon-collapse" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M6 7H1V5.5h2.44L0.22 2.28l1.06-1.06L4.5 4.44V2H6v5zm4-1h5v1.5h-2.44l3.22 3.22-1.06 1.06L11.5 8.56V11H10V6z"/></svg>
      </button>
      ${body}
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
    // Restore collapsed state on load
    (function() {
      try {
        var state = JSON.parse(localStorage.getItem('marvin-collapsed') || '{}');
        document.querySelectorAll('.collapsible[data-section-id]').forEach(function(el) {
          var id = el.getAttribute('data-section-id');
          if (state[id] === true) el.classList.add('collapsed');
          else if (state[id] === false) el.classList.remove('collapsed');
        });
      } catch(e) {}
    })();
  </script>
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
