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
a.card-link { color: inherit; text-decoration: none; cursor: pointer; }

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
  white-space: nowrap;
}

.badge-open { background: rgba(108, 140, 255, 0.15); color: var(--accent); }
.badge-done { background: rgba(52, 211, 153, 0.15); color: var(--green); }
.badge-in-progress { background: rgba(251, 191, 36, 0.15); color: var(--amber); }
.badge-draft { background: rgba(139, 143, 164, 0.15); color: var(--text-dim); }
.badge-closed, .badge-resolved { background: rgba(52, 211, 153, 0.15); color: var(--green); }
.badge-blocked { background: rgba(248, 113, 113, 0.15); color: var(--red); }
.badge-default { background: rgba(139, 143, 164, 0.1); color: var(--text-dim); }
.badge-subtle {
  background: rgba(139, 143, 164, 0.12);
  color: var(--text-dim);
  text-transform: none;
  font-weight: 500;
}

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
  min-width: 600px;
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

/* Prevent short-content columns from line-wrapping */
td:first-child,
th:first-child {
  white-space: nowrap;
  min-width: 4.5rem;
}

td:last-child,
th:last-child {
  white-space: nowrap;
}

tr:hover td {
  background: var(--bg-hover);
}

/* Hierarchical work-item sub-rows */
.child-row td {
  font-size: 0.8125rem;
  border-bottom-style: dashed;
}
.contribution-row td {
  font-size: 0.8125rem;
  color: var(--text-dim);
  border-bottom-style: dashed;
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

/* Compact overall status bar */
.gar-overall-compact {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1.25rem;
  margin-bottom: 1rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-card);
}

.gar-overall-status {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.gar-overall-status .dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.gar-overall-status .label {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.gar-overall-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.gar-metric {
  font-size: 0.78rem;
  color: var(--text-dim);
  background: rgba(255,255,255,0.05);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
}

.gar-areas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.gar-areas-3col {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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

/* Blocker / Risk detail cards */
.blocker-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.blocker-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  margin-bottom: 0.25rem;
}
.blocker-card-title {
  margin: 0.25rem 0 0.5rem;
  font-size: 1rem;
}
.blocker-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.85rem;
  color: var(--text-dim);
  margin-bottom: 0.75rem;
}
.blocker-card-content {
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
  font-size: 0.9rem;
}
.risk-assessment-content {
  background: var(--bg);
  border: 1px solid var(--border);
  border-left: 3px solid var(--amber);
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
  margin-top: 0.75rem;
  font-size: 0.9rem;
}
.risk-assess-btn {
  font-size: 0.8rem;
  padding: 0.4rem 0.8rem;
  margin-top: 0.75rem;
}
.risk-assess-loading {
  margin-top: 0.75rem;
  font-size: 0.85rem;
}
.risk-assess-error {
  margin-top: 0.5rem;
}
.risk-assessment-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--amber);
  font-weight: 600;
  margin-bottom: 0.5rem;
}

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
  height: 420px;
  min-height: 200px;
  max-height: 90vh;
  overflow-y: auto;
  resize: vertical;
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

.gantt-grid-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
  opacity: 0.35;
}

.gantt-sprint-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--text-dim);
  opacity: 0.3;
}

.gantt-today {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--red);
  opacity: 0.8;
  border-radius: 1px;
}

/* Sprint band in timeline */
.gantt-sprint-band-row {
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.25rem;
}

.gantt-sprint-band {
  height: 32px;
}

.gantt-sprint-block {
  position: absolute;
  top: 2px;
  bottom: 2px;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.65rem;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding: 0 0.4rem;
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

/* Persona switcher */
.persona-switcher {
  padding: 0.5rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.persona-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  font-weight: 600;
}

.persona-select {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 0.3rem 0.5rem;
  border-radius: var(--radius);
  font-size: 0.8rem;
  cursor: pointer;
  font-family: var(--font);
}

.persona-select:focus {
  outline: none;
  border-color: var(--persona-accent, var(--accent));
}

/* Persona banner (first-visit picker) */
.persona-banner {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.persona-banner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.persona-banner-header h3 {
  font-size: 1.1rem;
  font-weight: 600;
}

.persona-banner-dismiss {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
}

.persona-banner-dismiss:hover {
  color: var(--text);
}

.persona-banner-subtitle {
  color: var(--text-dim);
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.persona-banner-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
}

.persona-banner-option {
  display: block;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, background 0.15s;
  border-left: 3px solid var(--persona-card-accent, var(--accent));
}

.persona-banner-option:hover {
  border-color: var(--persona-card-accent, var(--accent));
  background: var(--bg-hover);
  text-decoration: none;
}

.persona-banner-name {
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 0.25rem;
}

.persona-banner-desc {
  font-size: 0.8rem;
  color: var(--text-dim);
}

/* Persona accent override */
.shell[style*="--persona-accent"] .sidebar nav a.active {
  color: var(--persona-accent);
  background: rgba(108, 140, 255, 0.08);
  border-right-color: var(--persona-accent);
}

.shell[style*="--persona-accent"] .sidebar-brand h1 {
  color: var(--persona-accent);
}

/* Persona page placeholder */
.persona-placeholder {
  text-align: center;
  padding: 3rem;
  color: var(--text-dim);
}

.persona-placeholder h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text);
}

/* Sprint Summary */
.sprint-goal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: var(--text);
}

.sprint-progress-bar {
  position: relative;
  height: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 1.25rem;
  overflow: hidden;
}

.sprint-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-dim), var(--accent));
  border-radius: 12px;
  transition: width 0.3s ease;
}

.sprint-progress-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text);
}

.sprint-ai-section {
  margin-top: 2rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
}

.sprint-ai-section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.sprint-generate-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  padding: 0.5rem 1.25rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  margin-top: 0.75rem;
  transition: background 0.15s;
}

.sprint-generate-btn:hover:not(:disabled) {
  background: var(--accent-dim);
}

.sprint-generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sprint-loading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 0;
  color: var(--text-dim);
  font-size: 0.85rem;
}

.sprint-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: sprint-spin 0.8s linear infinite;
}

@keyframes sprint-spin {
  to { transform: rotate(360deg); }
}

.sprint-error {
  color: var(--red);
  font-size: 0.85rem;
  padding: 0.5rem 0;
}

.sprint-ai-section .detail-content {
  margin-top: 1rem;
}

/* Collapsible sections */
.collapsible-header {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  user-select: none;
}

.collapsible-header:hover {
  color: var(--accent);
}

.collapsible-chevron {
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.collapsible.collapsed .collapsible-chevron {
  transform: rotate(-90deg);
}

.collapsible-body {
  max-height: 5000px;
  transition: max-height 0.3s ease, opacity 0.2s ease;
  opacity: 1;
}

.collapsible.collapsed .collapsible-body {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}

/* Sortable table headers */
.sortable-th {
  cursor: pointer;
  user-select: none;
}
.sortable-th:hover {
  text-decoration: underline;
  color: var(--text);
}
.sort-arrow {
  display: inline-block;
  margin-left: 0.3rem;
  font-size: 0.65rem;
  opacity: 0.7;
}

/* Persona picker (landing page) */
.persona-picker {
  text-align: center;
  padding: 4rem 2rem;
  max-width: 700px;
  margin: 0 auto;
}

.persona-picker h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.persona-picker-subtitle {
  color: var(--text-dim);
  font-size: 0.9rem;
  margin-bottom: 2rem;
}

.persona-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.persona-picker-card {
  display: block;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 4px solid var(--persona-card-accent, var(--accent));
  border-radius: var(--radius);
  padding: 1.5rem 1.25rem;
  text-decoration: none;
  color: inherit;
  text-align: left;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}

.persona-picker-card:hover {
  border-color: var(--persona-card-accent, var(--accent));
  background: var(--bg-hover);
  text-decoration: none;
  transform: translateY(-2px);
}

.persona-picker-name {
  font-weight: 600;
  font-size: 1.05rem;
  margin-bottom: 0.35rem;
}

.persona-picker-desc {
  font-size: 0.8rem;
  color: var(--text-dim);
  line-height: 1.5;
}

/* Secondary nav groups (shared pages, artifact lists) */
.nav-group-secondary .nav-group-label {
  opacity: 0.7;
}

/* Collapsible sidebar nav groups */
.nav-group-collapsible .nav-group-label {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  user-select: none;
}

.nav-group-collapsible .nav-group-label:hover {
  color: var(--text);
}

.nav-group-chevron {
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.nav-collapsed .nav-group-chevron {
  transform: rotate(-90deg);
}

.nav-group-links {
  overflow: hidden;
  max-height: 500px;
  transition: max-height 0.25s ease, opacity 0.2s ease;
  opacity: 1;
}

.nav-collapsed .nav-group-links {
  max-height: 0;
  opacity: 0;
}

/* Shorter scrollable tables */
.table-wrap.table-short {
  max-height: 400px;
}

/* Multi-select filter (native <details>) */
.multi-filter {
  position: relative;
}

.multi-filter summary {
  list-style: none;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius);
  font-size: 0.8rem;
  cursor: pointer;
  font-family: var(--font);
  white-space: nowrap;
}

.multi-filter summary::-webkit-details-marker { display: none; }

.multi-filter summary:hover {
  border-color: var(--text-dim);
}

.multi-filter summary:focus {
  outline: none;
  border-color: var(--accent);
}

.multi-filter-menu {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.35rem 0;
  min-width: 160px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 20;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  scrollbar-width: thin;
}

.multi-filter[open] .multi-filter-menu {
  display: block;
}

.multi-filter-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
}

.multi-filter-option:hover {
  background: var(--bg-hover);
}

.multi-filter-option input[type="checkbox"] {
  accent-color: var(--accent);
  cursor: pointer;
}

/* GAR insight bullets */
.gar-insights {
  list-style: none;
  font-size: 0.8rem;
  margin-top: 0.5rem;
  padding: 0;
}

.gar-insights li {
  padding: 0.15rem 0;
  color: var(--text-dim);
}

.gar-insights li::before {
  content: "\\2014\\00a0";
  color: var(--text-dim);
  opacity: 0.5;
}

/* Signal tag color variants */
.signal-tag-high {
  background: rgba(248, 113, 113, 0.18);
  color: var(--red);
}

.signal-tag-medium {
  background: rgba(251, 191, 36, 0.18);
  color: var(--amber);
}

.signal-tag-positive {
  background: rgba(52, 211, 153, 0.18);
  color: var(--green);
}

/* Mini progress bar (inline in tables) */
.mini-progress-bar {
  position: relative;
  width: 72px;
  height: 16px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
  overflow: hidden;
  display: inline-block;
  vertical-align: middle;
}

.mini-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.mini-progress-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--text);
}

/* Focus-grouped work items */
.focus-row td:first-child {
  border-left: 3px solid var(--focus-color, var(--border));
}

.focus-group-header td {
  background: var(--bg-hover);
  border-left: 3px solid var(--focus-color, var(--border));
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}

.focus-group-header td:first-child {
  border-left-width: 3px;
}

.focus-group-name {
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--text);
  margin-right: 0.75rem;
}

.focus-group-stats {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.focus-group-progress {
  width: 96px;
}

/* Owner badges for DM sprint view */
.owner-badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.owner-badge-po { background: rgba(108, 140, 255, 0.18); color: #6c8cff; }
.owner-badge-tl { background: rgba(251, 191, 36, 0.18); color: #fbbf24; }
.owner-badge-dm { background: rgba(52, 211, 153, 0.18); color: #34d399; }
.owner-badge-other { background: rgba(139, 143, 164, 0.12); color: var(--text-dim); }

/* Jira link icon */
.jira-link {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  margin-left: 0.35rem;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.jira-link:hover { opacity: 1; }
.jira-icon { vertical-align: middle; }

/* Group header rows (PO dashboard decisions/deps) */
.group-header-row td {
  background: var(--bg-hover);
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.8rem;
}
`;
}
