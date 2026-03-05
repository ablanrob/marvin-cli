import type { SprintSummaryData, SprintWorkItem } from "../../../reports/sprint-summary/types.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge, renderMarkdown, typeLabel } from "../layout.js";

function progressBar(pct: number): string {
  return `<div class="sprint-progress-bar">
    <div class="sprint-progress-fill" style="width: ${pct}%"></div>
    <span class="sprint-progress-label">${pct}%</span>
  </div>`;
}

export interface CachedSummaryInfo {
  html: string;
  generatedAt: string;
}

export function sprintSummaryPage(data: SprintSummaryData | null, cached?: CachedSummaryInfo): string {
  if (!data) {
    return `
      <div class="page-header">
        <h2>Sprint Summary</h2>
        <div class="subtitle">AI-powered sprint narrative</div>
      </div>
      <div class="empty">
        <h3>No Active Sprint</h3>
        <p>No active sprint found. Create a sprint and set its status to "active" to see the summary.</p>
      </div>`;
  }

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Completion</div>
        <div class="card-value">${data.workItems.completionPct}%</div>
        <div class="card-sub">${data.workItems.done} / ${data.workItems.total} items done</div>
      </div>
      <div class="card">
        <div class="card-label">Days Remaining</div>
        <div class="card-value">${data.timeline.daysRemaining}</div>
        <div class="card-sub">${data.timeline.daysElapsed} of ${data.timeline.totalDays} elapsed</div>
      </div>
      <div class="card">
        <div class="card-label">Epics</div>
        <div class="card-value">${data.linkedEpics.length}</div>
        <div class="card-sub">linked to sprint</div>
      </div>
      <div class="card">
        <div class="card-label">Blockers</div>
        <div class="card-value${data.blockers.length > 0 ? " priority-high" : ""}">${data.blockers.length}</div>
        <div class="card-sub">${data.openActions.length} open actions</div>
      </div>
    </div>`;

  // Linked epics table
  const epicsTable = data.linkedEpics.length > 0
    ? collapsibleSection(
        "ss-epics",
        "Linked Epics",
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Status</th><th>Tasks</th></tr>
            </thead>
            <tbody>
              ${data.linkedEpics.map((e) => `
              <tr>
                <td><a href="/docs/epic/${escapeHtml(e.id)}">${escapeHtml(e.id)}</a></td>
                <td>${escapeHtml(e.title)}</td>
                <td>${statusBadge(e.status)}</td>
                <td>${e.tasksDone} / ${e.tasksTotal}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3" },
      )
    : "";

  // Work items with hierarchical nesting (action → task → contribution)

  // --- Per-stream row background colors ---
  const STREAM_PALETTE = [
    "hsla(220, 30%, 22%, 0.45)",
    "hsla(160, 30%, 20%, 0.45)",
    "hsla(280, 25%, 22%, 0.45)",
    "hsla(30, 35%, 22%, 0.45)",
    "hsla(340, 25%, 22%, 0.45)",
    "hsla(190, 30%, 20%, 0.45)",
    "hsla(60, 25%, 20%, 0.45)",
    "hsla(120, 20%, 20%, 0.45)",
  ];

  function hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  // Collect unique stream names and assign colors
  function collectStreams(items: SprintWorkItem[]): Set<string> {
    const streams = new Set<string>();
    for (const w of items) {
      if (w.workStream) streams.add(w.workStream);
      if (w.children) {
        for (const s of collectStreams(w.children)) streams.add(s);
      }
    }
    return streams;
  }
  const uniqueStreams = collectStreams(data.workItems.items);
  const streamColorMap = new Map<string, string>();
  for (const name of uniqueStreams) {
    streamColorMap.set(name, STREAM_PALETTE[hashString(name) % STREAM_PALETTE.length]);
  }

  // Generate <style> block for stream row backgrounds
  const streamStyleRules = [...streamColorMap.entries()]
    .map(([name, color]) => `tr[data-stream="${escapeHtml(name)}"] td { background: ${color}; }`)
    .join("\n");
  const streamStyleBlock = streamStyleRules ? `<style>${streamStyleRules}</style>` : "";

  function renderItemRows(items: SprintWorkItem[], depth = 0): string[] {
    return items.flatMap((w) => {
      const isChild = depth > 0;
      const isContribution = w.type === "contribution";
      const classes: string[] = [];
      if (isContribution) classes.push("contribution-row");
      else if (isChild) classes.push("child-row");
      const dataStream = w.workStream ? ` data-stream="${escapeHtml(w.workStream)}"` : "";
      const rowAttrs = classes.length > 0 ? ` class="${classes.join(" ")}"` : "";
      const indent = depth > 0 ? ` style="padding-left: ${0.75 + depth * 1}rem"` : "";
      const streamCell = w.workStream
        ? `<span class="badge badge-subtle">${escapeHtml(w.workStream)}</span>`
        : "";
      const progressCell = !isContribution && w.progress !== undefined
        ? `<div class="mini-progress-bar"><div class="mini-progress-fill" style="width:${w.progress}%"></div><span class="mini-progress-label">${w.progress}%</span></div>`
        : "";
      const row = `
              <tr${rowAttrs}${dataStream}>
                <td${indent}><a href="/docs/${escapeHtml(w.type)}/${escapeHtml(w.id)}">${escapeHtml(w.id)}</a></td>
                <td>${escapeHtml(w.title)}</td>
                <td>${streamCell}</td>
                <td>${escapeHtml(typeLabel(w.type))}</td>
                <td>${statusBadge(w.status)}</td>
                <td>${progressCell}</td>
              </tr>`;
      const childRows = w.children ? renderItemRows(w.children, depth + 1) : [];
      return [row, ...childRows];
    });
  }
  const workItemRows = renderItemRows(data.workItems.items);

  const sortableHeaders = `<tr>
                <th class="sortable-th" onclick="sortWorkItems(0)">ID<span class="sort-arrow" id="sort-arrow-0"></span></th>
                <th class="sortable-th" onclick="sortWorkItems(1)">Title<span class="sort-arrow" id="sort-arrow-1"></span></th>
                <th class="sortable-th" onclick="sortWorkItems(2)">Stream<span class="sort-arrow" id="sort-arrow-2"></span></th>
                <th class="sortable-th" onclick="sortWorkItems(3)">Type<span class="sort-arrow" id="sort-arrow-3"></span></th>
                <th class="sortable-th" onclick="sortWorkItems(4)">Status<span class="sort-arrow" id="sort-arrow-4"></span></th>
                <th class="sortable-th" onclick="sortWorkItems(5)">Progress<span class="sort-arrow" id="sort-arrow-5"></span></th>
              </tr>`;

  const workItemsSection = workItemRows.length > 0
    ? collapsibleSection(
        "ss-work-items",
        "Work Items",
        `${streamStyleBlock}
        <div class="table-wrap">
          <table id="work-items-table">
            <thead>
              ${sortableHeaders}
            </thead>
            <tbody>
              ${workItemRows.join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3", defaultCollapsed: true },
      )
    : "";

  // Recent activity
  const activitySection = data.artifacts.length > 0
    ? collapsibleSection(
        "ss-activity",
        "Recent Activity",
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>ID</th><th>Title</th><th>Type</th><th>Action</th></tr>
            </thead>
            <tbody>
              ${data.artifacts.slice(0, 15).map((a) => `
              <tr>
                <td>${formatDate(a.date)}</td>
                <td><a href="/docs/${escapeHtml(a.type)}/${escapeHtml(a.id)}">${escapeHtml(a.id)}</a></td>
                <td>${escapeHtml(a.title)}</td>
                <td>${escapeHtml(typeLabel(a.type))}</td>
                <td>${escapeHtml(a.action)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3", defaultCollapsed: true },
      )
    : "";

  // Meetings
  const meetingsSection = data.meetings.length > 0
    ? collapsibleSection(
        "ss-meetings",
        `Meetings (${data.meetings.length})`,
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>ID</th><th>Title</th></tr>
            </thead>
            <tbody>
              ${data.meetings.map((m) => `
              <tr>
                <td>${formatDate(m.date)}</td>
                <td><a href="/docs/meeting/${escapeHtml(m.id)}">${escapeHtml(m.id)}</a></td>
                <td>${escapeHtml(m.title)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`,
        { titleTag: "h3", defaultCollapsed: true },
      )
    : "";

  const goalHtml = data.sprint.goal
    ? `<div class="sprint-goal"><strong>Goal:</strong> ${escapeHtml(data.sprint.goal)}</div>`
    : "";

  const dateRange = data.sprint.startDate && data.sprint.endDate
    ? `<span class="text-dim">${formatDate(data.sprint.startDate)} — ${formatDate(data.sprint.endDate)}</span>`
    : "";

  return `
    <div class="page-header">
      <h2>${escapeHtml(data.sprint.id)} — ${escapeHtml(data.sprint.title)} ${statusBadge(data.sprint.status)}</h2>
      <div class="subtitle">Sprint Summary ${dateRange}</div>
    </div>
    ${goalHtml}
    ${progressBar(data.timeline.percentComplete)}
    ${statsCards}
    ${epicsTable}
    ${workItemsSection}
    ${activitySection}
    ${meetingsSection}

    <div class="sprint-ai-section">
      <h3>AI Summary</h3>
      ${cached
        ? `<p class="text-dim">Generated ${formatDate(cached.generatedAt)} at ${cached.generatedAt.slice(11, 16)} UTC</p>`
        : `<p class="text-dim">Generate a narrative summary of this sprint's progress, risks, and projections.</p>`}
      <button class="sprint-generate-btn" onclick="generateSummary()" id="generate-btn">${cached ? "Regenerate" : "Generate AI Summary"}</button>
      <div id="summary-loading" class="sprint-loading" style="display:none">
        <div class="sprint-spinner"></div>
        <span>Generating summary...</span>
      </div>
      <div id="summary-error" class="sprint-error" style="display:none"></div>
      <div id="summary-content" class="detail-content"${cached ? "" : ' style="display:none"'}>${cached ? cached.html : ""}</div>
    </div>

    <script>
      var _sortCol = -1;
      var _sortAsc = true;

      function sortWorkItems(col) {
        var table = document.getElementById('work-items-table');
        if (!table) return;
        var tbody = table.querySelector('tbody');
        var allRows = Array.from(tbody.querySelectorAll('tr'));

        // Toggle direction if clicking the same column
        if (_sortCol === col) {
          _sortAsc = !_sortAsc;
        } else {
          _sortCol = col;
          _sortAsc = true;
        }

        // Update sort arrows
        for (var i = 0; i < 6; i++) {
          var arrow = document.getElementById('sort-arrow-' + i);
          if (arrow) arrow.textContent = i === col ? (_sortAsc ? ' \\u25B2' : ' \\u25BC') : '';
        }

        // Group rows: root rows + their child/contribution rows
        var groups = [];
        var current = null;
        for (var r = 0; r < allRows.length; r++) {
          var row = allRows[r];
          var isChild = row.classList.contains('child-row') || row.classList.contains('contribution-row');
          if (!isChild) {
            current = { root: row, children: [] };
            groups.push(current);
          } else if (current) {
            current.children.push(row);
          }
        }

        // Sort groups by root row text content of target column
        groups.sort(function(a, b) {
          var aText = (a.root.children[col] ? a.root.children[col].textContent : '').trim().toLowerCase();
          var bText = (b.root.children[col] ? b.root.children[col].textContent : '').trim().toLowerCase();
          if (aText < bText) return _sortAsc ? -1 : 1;
          if (aText > bText) return _sortAsc ? 1 : -1;
          return 0;
        });

        // Re-append rows in sorted order
        for (var g = 0; g < groups.length; g++) {
          tbody.appendChild(groups[g].root);
          for (var c = 0; c < groups[g].children.length; c++) {
            tbody.appendChild(groups[g].children[c]);
          }
        }
      }

      async function generateSummary() {
        var btn = document.getElementById('generate-btn');
        var loading = document.getElementById('summary-loading');
        var errorEl = document.getElementById('summary-error');
        var content = document.getElementById('summary-content');

        btn.disabled = true;
        btn.style.display = 'none';
        loading.style.display = 'flex';
        errorEl.style.display = 'none';
        content.style.display = 'none';

        try {
          var res = await fetch('/api/sprint-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sprintId: '${escapeHtml(data.sprint.id)}' })
          });
          var json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Failed to generate summary');
          loading.style.display = 'none';
          content.innerHTML = json.html;
          content.style.display = 'block';
          btn.textContent = 'Regenerate';
          btn.style.display = '';
          btn.disabled = false;
        } catch (e) {
          loading.style.display = 'none';
          errorEl.textContent = e.message;
          errorEl.style.display = 'block';
          btn.style.display = '';
          btn.disabled = false;
        }
      }
    </script>`;
}
