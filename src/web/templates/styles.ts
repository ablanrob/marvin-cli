export function renderStyles(): string {
  return `
:root {
  --bg: #0f1117;
  --bg-card: #1a1d27;
  --bg-hover: #222632;
  --border: #2a2e3a;
  --text: #e1e4ea;
  --text-dim: #8b8fa4;
  --accent: #6c8cff;
  --accent-dim: #4a6ad4;
  --green: #34d399;
  --amber: #fbbf24;
  --red: #f87171;
  --radius: 8px;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --mono: "SF Mono", "Fira Code", monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  min-height: 100vh;
}

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Layout */
.shell {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 220px;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  padding: 1.5rem 0;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  overflow-y: auto;
}

.sidebar-brand {
  padding: 0 1.25rem 1.25rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
}

.sidebar-brand h1 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.02em;
}

.sidebar-brand .project-name {
  font-size: 0.75rem;
  color: var(--text-dim);
  margin-top: 0.25rem;
}

.sidebar nav a {
  display: block;
  padding: 0.5rem 1.25rem;
  color: var(--text-dim);
  font-size: 0.875rem;
  transition: background 0.15s, color 0.15s;
}

.sidebar nav a:hover {
  background: var(--bg-hover);
  color: var(--text);
  text-decoration: none;
}

.sidebar nav a.active {
  color: var(--accent);
  background: rgba(108, 140, 255, 0.08);
  border-right: 2px solid var(--accent);
}

.nav-group {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.nav-group-label {
  padding: 0.25rem 1.25rem 0.25rem;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  font-weight: 600;
}

.main {
  margin-left: 220px;
  flex: 1;
  padding: 2rem 2.5rem;
  max-width: 1200px;
  position: relative;
  transition: max-width 0.2s ease;
}
.main.expanded {
  max-width: none;
}
.expand-toggle {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-dim);
  cursor: pointer;
  padding: 0.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, border-color 0.15s;
}
.expand-toggle:hover {
  color: var(--text);
  border-color: var(--text-dim);
}
.main.expanded .icon-expand { display: none; }
.main:not(.expanded) .icon-collapse { display: none; }

/* Page header */
.page-header {
  margin-bottom: 2rem;
}

.page-header h2 {
  font-size: 1.5rem;
  font-weight: 600;
}

.page-header .subtitle {
  color: var(--text-dim);
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

/* Breadcrumb */
.breadcrumb {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 1rem;
}

.breadcrumb a { color: var(--text-dim); }
.breadcrumb a:hover { color: var(--accent); }
.breadcrumb .sep { margin: 0 0.4rem; }

/* Card groups */
.card-group {
  margin-bottom: 1.5rem;
}

.card-group-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  font-weight: 600;
  margin-bottom: 0.5rem;
}

/* Cards grid */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
  transition: border-color 0.15s;
}

.card:hover {
  border-color: var(--accent-dim);
}

.card a { color: inherit; text-decoration: none; display: block; }

.card .card-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  margin-bottom: 0.5rem;
}

.card .card-value {
  font-size: 1.75rem;
  font-weight: 700;
}

.card .card-sub {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-top: 0.25rem;
}

/* Status badge */
.badge {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.badge-open { background: rgba(108, 140, 255, 0.15); color: var(--accent); }
.badge-done { background: rgba(52, 211, 153, 0.15); color: var(--green); }
.badge-in-progress { background: rgba(251, 191, 36, 0.15); color: var(--amber); }
.badge-draft { background: rgba(139, 143, 164, 0.15); color: var(--text-dim); }
.badge-closed, .badge-resolved { background: rgba(52, 211, 153, 0.15); color: var(--green); }
.badge-blocked { background: rgba(248, 113, 113, 0.15); color: var(--red); }
.badge-default { background: rgba(139, 143, 164, 0.1); color: var(--text-dim); }

/* Table */
.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  text-align: left;
  padding: 0.6rem 0.75rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  border-bottom: 1px solid var(--border);
}

td {
  padding: 0.6rem 0.75rem;
  font-size: 0.875rem;
  border-bottom: 1px solid var(--border);
}

tr:hover td {
  background: var(--bg-hover);
}

/* GAR */
.gar-overall {
  text-align: center;
  padding: 2rem;
  margin-bottom: 2rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-card);
}

.gar-overall .dot {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: inline-block;
  margin-bottom: 0.75rem;
}

.gar-overall .label {
  font-size: 1.1rem;
  font-weight: 600;
  text-transform: uppercase;
}

.gar-areas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.gar-area {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
}

.gar-area .area-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.gar-area .area-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.gar-area .area-name {
  font-weight: 600;
  font-size: 1rem;
}

.gar-area .area-summary {
  font-size: 0.85rem;
  color: var(--text-dim);
  margin-bottom: 0.75rem;
}

.gar-area ul {
  list-style: none;
  font-size: 0.8rem;
}

.gar-area li {
  padding: 0.2rem 0;
  color: var(--text-dim);
}

.gar-area li .ref-id {
  color: var(--accent);
  font-family: var(--mono);
  margin-right: 0.4rem;
}

.dot-green { background: var(--green); }
.dot-amber { background: var(--amber); }
.dot-red { background: var(--red); }

/* Board / Kanban */
.board {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  padding-bottom: 1rem;
}

.board-column {
  min-width: 240px;
  max-width: 300px;
  flex: 1;
}

.board-column-header {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid var(--border);
  margin-bottom: 0.5rem;
  display: flex;
  justify-content: space-between;
}

.board-column-header .count {
  background: var(--bg-hover);
  padding: 0 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
}

.board-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  transition: border-color 0.15s;
}

.board-card:hover {
  border-color: var(--accent-dim);
}

.board-card .bc-id {
  font-family: var(--mono);
  font-size: 0.7rem;
  color: var(--accent);
}

.board-card .bc-title {
  font-size: 0.85rem;
  margin: 0.25rem 0;
}

.board-card .bc-owner {
  font-size: 0.7rem;
  color: var(--text-dim);
}

/* Detail page */
.detail-meta {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.detail-meta dl {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 0.4rem 1rem;
}

.detail-meta dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
}

.detail-meta dd {
  font-size: 0.875rem;
}

.detail-content {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  line-height: 1.7;
}

.detail-content h1, .detail-content h2, .detail-content h3 {
  margin: 1.25rem 0 0.5rem;
  font-weight: 600;
}

.detail-content h1 { font-size: 1.3rem; }
.detail-content h2 { font-size: 1.15rem; }
.detail-content h3 { font-size: 1rem; }
.detail-content p { margin-bottom: 0.75rem; }
.detail-content ul, .detail-content ol { margin: 0.5rem 0 0.75rem 1.5rem; }
.detail-content li { margin-bottom: 0.25rem; }
.detail-content code {
  background: var(--bg-hover);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 0.85em;
}
.detail-content hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1.25rem 0;
}
.detail-content .table-wrap {
  margin: 0.75rem 0;
}

/* Filters */
.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.filters select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius);
  font-size: 0.8rem;
  cursor: pointer;
}

.filters select:focus {
  outline: none;
  border-color: var(--accent);
}

/* Empty state */
.empty {
  text-align: center;
  padding: 3rem;
  color: var(--text-dim);
}

.empty p { font-size: 0.9rem; }

/* Section heading */
.section-title {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 1.5rem 0 0.75rem;
}

/* Priority */
.priority-high { color: var(--red); }
.priority-medium { color: var(--amber); }
.priority-low { color: var(--green); }

/* Health */
.health-section-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 2rem 0 1rem;
  color: var(--text);
}

/* Mermaid diagrams */
.mermaid-container {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  margin: 1rem 0;
  overflow-x: auto;
}

.mermaid-container .mermaid {
  display: flex;
  justify-content: center;
}

.mermaid-empty {
  text-align: center;
  color: var(--text-dim);
  font-size: 0.875rem;
}

.mermaid-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}

.mermaid-row .mermaid-container {
  margin: 0;
}
`;
}
