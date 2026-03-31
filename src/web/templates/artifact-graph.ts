import type { ArtifactRelationships, LineageEvent } from "../data.js";
import { statusClass, sanitize } from "./mermaid.js";
import { escapeHtml, formatDate, linkArtifactIds } from "./layout.js";

// ========================================================================
// Artifact Relationship Graph
// ========================================================================

export function buildArtifactRelationGraph(data: ArtifactRelationships): string {
  const hasContent =
    data.origins.length > 0 ||
    data.parents.length > 0 ||
    data.children.length > 0 ||
    data.external.length > 0;

  if (!hasContent) {
    return `<div class="flow-diagram flow-empty"><p>No relationships found for this artifact.</p></div>`;
  }

  const edges = data.edges;

  const renderNode = (id: string, title: string, status: string, type: string) => {
    const href = type === "jira" ? (title.startsWith("http") ? title : "#") : `/docs/${type}/${id}`;
    const target = type === "jira" ? ' target="_blank" rel="noopener"' : "";
    const cls = type === "jira" ? "flow-node flow-external" : `flow-node ${statusClass(status)}`;
    const displayTitle = type === "jira" ? "Jira Issue" : sanitize(title, 35);
    const displayId = type === "jira" ? `${id} ↗` : id;

    return `<div class="${cls}" data-flow-id="${escapeHtml(id)}">
      <a class="flow-node-id" href="${escapeHtml(href)}"${target}>${escapeHtml(displayId)}</a>
      <span class="flow-node-title">${escapeHtml(displayTitle)}</span>
    </div>`;
  };

  const selfNode = `<div class="flow-node flow-self ${statusClass(data.self.status)}" data-flow-id="${escapeHtml(data.self.id)}">
    <span class="flow-node-id">${escapeHtml(data.self.id)}</span>
    <span class="flow-node-title">${escapeHtml(sanitize(data.self.title, 35))}</span>
  </div>`;

  const columns: { header: string; nodes: string }[] = [];

  if (data.origins.length > 0) {
    columns.push({
      header: "Origins",
      nodes: data.origins.map((a) => renderNode(a.id, a.title, a.status, a.type)).join("\n"),
    });
  }

  if (data.parents.length > 0) {
    columns.push({
      header: "Parents",
      nodes: data.parents.map((a) => renderNode(a.id, a.title, a.status, a.type)).join("\n"),
    });
  }

  columns.push({
    header: data.self.type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    nodes: selfNode,
  });

  if (data.children.length > 0) {
    columns.push({
      header: "Children",
      nodes: data.children.map((a) => renderNode(a.id, a.title, a.status, a.type)).join("\n"),
    });
  }

  if (data.external.length > 0) {
    columns.push({
      header: "External",
      nodes: data.external.map((a) => renderNode(a.id, a.title, a.status, a.type)).join("\n"),
    });
  }

  const columnsHtml = columns
    .map(
      (col) => `
    <div class="flow-column">
      <div class="flow-column-header">${escapeHtml(col.header)}</div>
      ${col.nodes}
    </div>`,
    )
    .join("\n");

  const edgesJson = JSON.stringify(edges);

  return `
    <div class="flow-diagram" id="rel-graph">
      <svg class="flow-lines" id="rel-lines"></svg>
      <div class="flow-columns">
        ${columnsHtml}
      </div>
    </div>
    <script>
    (function() {
      var edges = ${edgesJson};
      var container = document.getElementById('rel-graph');
      var svg = document.getElementById('rel-lines');
      if (!container || !svg) return;

      var fwd = {};
      var bwd = {};
      edges.forEach(function(e) {
        if (!fwd[e.from]) fwd[e.from] = [];
        if (!bwd[e.to]) bwd[e.to] = [];
        fwd[e.from].push(e.to);
        bwd[e.to].push(e.from);
      });

      function drawLines() {
        var rect = container.getBoundingClientRect();
        var scrollW = container.scrollWidth;
        var scrollH = container.scrollHeight;
        svg.setAttribute('width', scrollW);
        svg.setAttribute('height', scrollH);
        svg.innerHTML = '';

        var scrollLeft = container.scrollLeft;
        var scrollTop = container.scrollTop;

        edges.forEach(function(edge) {
          var fromEl = container.querySelector('[data-flow-id="' + edge.from + '"]');
          var toEl = container.querySelector('[data-flow-id="' + edge.to + '"]');
          if (!fromEl || !toEl) return;

          var fr = fromEl.getBoundingClientRect();
          var tr = toEl.getBoundingClientRect();
          var x1 = fr.right - rect.left + scrollLeft;
          var y1 = fr.top + fr.height / 2 - rect.top + scrollTop;
          var x2 = tr.left - rect.left + scrollLeft;
          var y2 = tr.top + tr.height / 2 - rect.top + scrollTop;
          var mx = (x1 + x2) / 2;

          var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', '#2a2e3a');
          path.setAttribute('stroke-width', '1.5');
          path.dataset.from = edge.from;
          path.dataset.to = edge.to;
          svg.appendChild(path);
        });
      }

      function findConnected(startId) {
        var visited = {};
        visited[startId] = true;
        var queue = [startId];
        while (queue.length) {
          var id = queue.shift();
          (fwd[id] || []).forEach(function(n) {
            if (!visited[n]) { visited[n] = true; queue.push(n); }
          });
        }
        queue = [startId];
        while (queue.length) {
          var id = queue.shift();
          (bwd[id] || []).forEach(function(n) {
            if (!visited[n]) { visited[n] = true; queue.push(n); }
          });
        }
        return visited;
      }

      function highlight(hoveredId) {
        var connected = findConnected(hoveredId);
        container.querySelectorAll('.flow-node').forEach(function(n) {
          if (connected[n.dataset.flowId]) {
            n.classList.add('flow-lit'); n.classList.remove('flow-dim');
          } else {
            n.classList.add('flow-dim'); n.classList.remove('flow-lit');
          }
        });
        svg.querySelectorAll('path').forEach(function(p) {
          if (connected[p.dataset.from] && connected[p.dataset.to]) {
            p.classList.add('flow-line-lit'); p.classList.remove('flow-line-dim');
          } else {
            p.classList.add('flow-line-dim'); p.classList.remove('flow-line-lit');
          }
        });
      }

      function clearHighlight() {
        container.querySelectorAll('.flow-node').forEach(function(n) { n.classList.remove('flow-lit', 'flow-dim'); });
        svg.querySelectorAll('path').forEach(function(p) { p.classList.remove('flow-line-lit', 'flow-line-dim'); });
      }

      var activeId = null;
      container.addEventListener('click', function(e) {
        if (e.target.closest('a')) return;
        var node = e.target.closest('.flow-node');
        var clickedId = node ? node.dataset.flowId : null;
        if (!clickedId || clickedId === activeId) {
          activeId = null; clearHighlight(); return;
        }
        activeId = clickedId;
        highlight(clickedId);
      });

      function drawAndHighlight() {
        drawLines();
        if (activeId) highlight(activeId);
      }

      requestAnimationFrame(function() { setTimeout(drawAndHighlight, 100); });
      window.addEventListener('resize', drawAndHighlight);
      container.addEventListener('scroll', drawAndHighlight);
      new ResizeObserver(drawAndHighlight).observe(container);
    })();
    </script>`;
}

// ========================================================================
// Artifact Lineage Timeline
// ========================================================================

const EVENT_ICONS: Record<string, string> = {
  created: "🟢",
  "source-linked": "🔵",
  "child-spawned": "🟡",
  assessment: "🟣",
  "jira-sync": "🔷",
};

export function buildLineageTimeline(events: LineageEvent[]): string {
  if (events.length === 0) {
    return "";
  }

  const entries = events.map((event) => {
    const icon = EVENT_ICONS[event.type] ?? "⚪";
    const date = event.date ? formatDate(event.date) : "";
    const time = event.date?.slice(11, 16) ?? "";
    const label = linkArtifactIds(escapeHtml(event.label));

    return `
      <div class="lineage-entry lineage-${escapeHtml(event.type)}">
        <div class="lineage-marker">${icon}</div>
        <div class="lineage-content">
          <span class="lineage-date">${escapeHtml(date)} ${escapeHtml(time)}</span>
          <span class="lineage-label">${label}</span>
        </div>
      </div>`;
  });

  return `
    <div class="lineage-timeline">
      <h3>Lineage</h3>
      ${entries.join("\n")}
    </div>`;
}
