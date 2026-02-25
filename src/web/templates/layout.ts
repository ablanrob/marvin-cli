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

/** Minimal markdown → HTML (headings, paragraphs, lists, bold, italic, code) */
export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  let listTag = "ul";

  for (const raw of lines) {
    const line = raw;

    // Close list if we leave a list context
    if (inList && !/^\s*[-*]\s/.test(line) && !/^\s*\d+\.\s/.test(line) && line.trim() !== "") {
      out.push(`</${listTag}>`);
      inList = false;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inline(headingMatch[2])}</h${level}>`);
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
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      if (inList) {
        out.push(`</${listTag}>`);
        inList = false;
      }
      continue;
    }

    // Paragraph
    out.push(`<p>${inline(line)}</p>`);
  }

  if (inList) out.push(`</${listTag}>`);
  return out.join("\n");
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

interface LayoutOptions {
  title: string;
  activePath: string;
  projectName: string;
  navTypes: string[];
}

export function layout(opts: LayoutOptions, body: string): string {
  const navItems = [
    { href: "/", label: "Overview" },
    { href: "/board", label: "Board" },
    { href: "/gar", label: "GAR Report" },
  ];

  const typeNavItems = opts.navTypes.map((type) => ({
    href: `/docs/${type}`,
    label: typeLabel(type) + "s",
  }));

  const isActive = (href: string) =>
    opts.activePath === href || (href !== "/" && opts.activePath.startsWith(href))
      ? " active"
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
  <div class="shell">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <h1>Marvin</h1>
        <div class="project-name">${escapeHtml(opts.projectName)}</div>
      </div>
      <nav>
        ${navItems.map((n) => `<a href="${n.href}" class="${isActive(n.href)}">${n.label}</a>`).join("\n        ")}
        ${typeNavItems.map((n) => `<a href="${n.href}" class="${isActive(n.href)}">${n.label}</a>`).join("\n        ")}
      </nav>
    </aside>
    <main class="main">
      ${body}
    </main>
  </div>
</body>
</html>`;
}
