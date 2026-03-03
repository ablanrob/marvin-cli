import type { SprintSummaryData } from "../../../reports/sprint-summary/types.js";
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

  // Work items by status
  const workItemsSection = data.workItems.total > 0
    ? collapsibleSection(
        "ss-work-items",
        "Work Items",
        `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Type</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${data.workItems.items.map((w) => `
              <tr>
                <td><a href="/docs/${escapeHtml(w.type)}/${escapeHtml(w.id)}">${escapeHtml(w.id)}</a></td>
                <td>${escapeHtml(w.title)}</td>
                <td>${escapeHtml(typeLabel(w.type))}</td>
                <td>${statusBadge(w.status)}</td>
              </tr>`).join("")}
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
