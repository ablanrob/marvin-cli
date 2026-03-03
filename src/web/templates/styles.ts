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
  overflow-y: auto;
  max-height: calc(100vh - 280px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
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
  position: sticky;
  top: 0;
  background: var(--bg-card);
  z-index: 1;
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
  display: flex;
  flex-direction: column;
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
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
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
  scrollbar-width: thin;
  padding-bottom: 1rem;
}

.board-column {
  min-width: 240px;
  max-width: 300px;
  flex: 0 0 auto;
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
  flex-shrink: 0;
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

/* Three-column artifact flow */
.flow-diagram {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
  position: relative;
  overflow-x: auto;
}

.flow-lines {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.flow-columns {
  display: flex;
  gap: 3rem;
  position: relative;
  min-width: 600px;
}

.flow-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.flow-column-header {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  font-weight: 600;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.25rem;
}

.flow-node {
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  border-left: 3px solid var(--border);
  background: var(--bg);
  transition: border-color 0.15s, background 0.15s;
}

.flow-node:hover {
  background: var(--bg-hover);
}

.flow-node-id {
  display: inline-block;
  font-family: var(--mono);
  font-size: 0.65rem;
  color: var(--accent);
  margin-bottom: 0.15rem;
  text-decoration: none;
}

.flow-node-id:hover {
  text-decoration: underline;
}

.flow-node-title {
  display: block;
  font-size: 0.8rem;
}

.flow-done { border-left-color: var(--green); }
.flow-active { border-left-color: var(--amber); }
.flow-blocked { border-left-color: var(--red); }
.flow-default { border-left-color: var(--accent-dim); }

.flow-node { cursor: pointer; transition: opacity 0.2s, border-color 0.15s, background 0.15s; }
.flow-dim { opacity: 0.2; }
.flow-lit { background: var(--bg-hover); }
.flow-line-lit { stroke: var(--accent) !important; stroke-width: 2 !important; }
.flow-line-dim { opacity: 0.08; }

/* Gantt truncation note */
.mermaid-note {
  font-size: 0.75rem;
  color: var(--text-dim);
  text-align: right;
  margin-bottom: 0.5rem;
}

/* HTML Gantt chart */
.gantt {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1.25rem 1.25rem 0;
  position: relative;
  overflow-x: auto;
}

.gantt-chart {
  min-width: 600px;
}

.gantt-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  display: flex;
}

.gantt-header,
.gantt-section-row,
.gantt-row,
.gantt-overlay {
  display: flex;
  align-items: center;
}

.gantt-label {
  width: 200px;
  min-width: 200px;
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
  color: var(--text-dim);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gantt-section-label {
  font-weight: 600;
  color: var(--text);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding-top: 0.6rem;
}

.gantt-track {
  flex: 1;
  position: relative;
  height: 28px;
  min-width: 0;
}

.gantt-section-row .gantt-track {
  height: 20px;
}

.gantt-section-bg {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--bg-hover);
  border-radius: 3px;
  opacity: 0.4;
}

.gantt-bar {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: 4px;
  min-width: 6px;
  transition: opacity 0.15s;
}

.gantt-bar:hover {
  opacity: 0.85;
}

.gantt-bar-done {
  background: var(--green);
}

.gantt-bar-active {
  background: var(--amber);
}

.gantt-bar-blocked {
  background: var(--red);
}

.gantt-bar-default {
  background: var(--accent-dim);
}

.gantt-dates {
  height: 24px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.25rem;
}

.gantt-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--border);
}

.gantt-marker span {
  position: absolute;
  top: 2px;
  left: 6px;
  font-size: 0.65rem;
  color: var(--text-dim);
  white-space: nowrap;
}

.gantt-today {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--red);
  opacity: 0.7;
}

/* Pie chart color overrides */
.mermaid-container .pieCircle {
  stroke: var(--bg-card);
}

.mermaid-container text.slice {
  fill: var(--bg) !important;
  font-weight: 600;
}

/* Urgency row indicators */
.urgency-row-overdue { border-left: 3px solid var(--red); }
.urgency-row-due-3d { border-left: 3px solid var(--amber); }
.urgency-row-due-7d { border-left: 3px solid #e2a308; }

/* Urgency badge pills */
.urgency-badge-overdue { background: rgba(248, 113, 113, 0.15); color: var(--red); }
.urgency-badge-due-3d { background: rgba(251, 191, 36, 0.15); color: var(--amber); }
.urgency-badge-due-7d { background: rgba(226, 163, 8, 0.15); color: #e2a308; }
.urgency-badge-upcoming { background: rgba(108, 140, 255, 0.15); color: var(--accent); }
.urgency-badge-later { background: rgba(139, 143, 164, 0.1); color: var(--text-dim); }

/* Trending */
.trending-rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-hover);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-dim);
}

.trending-score {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  background: rgba(108, 140, 255, 0.15);
  color: var(--accent);
}

.signal-tag {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  font-size: 0.65rem;
  background: var(--bg-hover);
  color: var(--text-dim);
  margin-right: 0.25rem;
  margin-bottom: 0.15rem;
  white-space: nowrap;
}

.text-dim { color: var(--text-dim); }
`;
}
