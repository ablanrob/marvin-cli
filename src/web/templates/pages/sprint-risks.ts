import type { SprintSummaryData } from "../../../reports/sprint-summary/types.js";
import type { DocumentStore } from "../../../storage/store.js";
import { escapeHtml, formatDate, statusBadge, typeLabel, renderMarkdown } from "../layout.js";

export function sprintRisksPage(data: SprintSummaryData | null, store: DocumentStore): string {
  if (!data) {
    return `
      <div class="page-header">
        <h2>Sprint Risks</h2>
        <div class="subtitle">Risk items in the active sprint</div>
      </div>
      <div class="empty">
        <h3>No Active Sprint</h3>
        <p>No active sprint found.</p>
      </div>`;
  }

  const riskDocs = data.risks.map((r) => {
    const doc = store.get(r.id);
    return { ...r, doc };
  });

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Open Risks</div>
        <div class="card-value${riskDocs.length > 0 ? " priority-medium" : ""}">${riskDocs.length}</div>
        <div class="card-sub">in ${escapeHtml(data.sprint.id)}</div>
      </div>
    </div>`;

  const itemCards = riskDocs.map((r) => {
    const doc = r.doc;
    const owner = doc?.frontmatter.owner;
    const assignee = doc?.frontmatter.assignee;
    const content = doc?.content?.trim();

    return `
      <div class="blocker-card" id="risk-${escapeHtml(r.id)}">
        <div class="blocker-card-header">
          <a href="/docs/${escapeHtml(r.type)}/${escapeHtml(r.id)}">${escapeHtml(r.id)}</a>
          <span class="text-dim">${escapeHtml(typeLabel(r.type))}</span>
          ${statusBadge(doc?.frontmatter.status ?? "open")}
        </div>
        <h4 class="blocker-card-title">${escapeHtml(r.title)}</h4>
        <div class="blocker-card-meta">
          ${owner ? `<span><strong>Owner:</strong> ${escapeHtml(owner)}</span>` : ""}
          ${assignee ? `<span><strong>Assignee:</strong> ${escapeHtml(assignee)}</span>` : ""}
          ${doc?.frontmatter.created ? `<span><strong>Created:</strong> ${formatDate(doc.frontmatter.created)}</span>` : ""}
        </div>
        ${content ? `<div class="blocker-card-content detail-content">${renderMarkdown(content)}</div>` : ""}
        <div class="risk-assessment" id="assessment-${escapeHtml(r.id)}">
          <button class="sprint-generate-btn risk-assess-btn" onclick="generateAssessment('${escapeHtml(r.id)}', this)">Assess Risk</button>
          <div class="sprint-loading risk-assess-loading" style="display:none">
            <div class="sprint-spinner"></div>
            <span>Analyzing...</span>
          </div>
          <div class="sprint-error risk-assess-error" style="display:none"></div>
          <div class="risk-assessment-content detail-content" style="display:none"></div>
        </div>
      </div>`;
  }).join("");

  const emptyMessage = riskDocs.length === 0
    ? `<div class="empty"><h3>No Risks</h3><p>No open risk items in this sprint.</p></div>`
    : "";

  const script = riskDocs.length > 0
    ? `
    <script>
      async function generateAssessment(riskId, btn) {
        var container = document.getElementById('assessment-' + riskId);
        var loading = container.querySelector('.risk-assess-loading');
        var errorEl = container.querySelector('.risk-assess-error');
        var contentEl = container.querySelector('.risk-assessment-content');

        btn.disabled = true;
        btn.style.display = 'none';
        loading.style.display = 'flex';
        errorEl.style.display = 'none';

        try {
          var res = await fetch('/api/risk-assessment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sprintId: '${escapeHtml(data.sprint.id)}', riskId: riskId })
          });
          var json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Failed to generate assessment');

          contentEl.innerHTML = '<div class="risk-assessment-label">AI Assessment</div>' + json.html;
          contentEl.style.display = 'block';

          loading.style.display = 'none';
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
    </script>`
    : "";

  return `
    <div class="page-header">
      <h2>Sprint Risks</h2>
      <div class="subtitle">Risk items in ${escapeHtml(data.sprint.id)} — ${escapeHtml(data.sprint.title)}</div>
    </div>
    ${statsCards}
    ${emptyMessage}
    ${itemCards}
    ${script}`;
}
