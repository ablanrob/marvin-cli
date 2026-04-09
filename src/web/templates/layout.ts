import type { DashboardPersona } from "../persona-views.js";
import { escapeHtml } from "./html-utils.js";

// Re-export html-utils and markdown for backward compatibility.
// Existing consumers can continue importing from "./layout.js".
export {
  collapsibleSection,
  escapeHtml,
  statusBadge,
  formatDate,
  typeLabel,
  jiraIcon,
  confluenceIcon,
  integrationIcons,
  ownerBadge,
} from "./html-utils.js";
export { renderMarkdown, linkArtifactIds } from "./markdown.js";

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
  persona?: DashboardPersona;
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

  const accentOverride =
    opts.personaAccentColor && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(opts.personaAccentColor)
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
  ${
    opts.persona
      ? `<script>
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
  </script>`
      : ""
  }
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
