import type { Document } from "../../storage/types.js";
import { normalizeLinkedFeatures } from "../../plugins/builtin/tools/epic-utils.js";

/** Sanitize a string for use in Mermaid labels — strip quotes and limit length */
function sanitize(text: string, maxLen = 40): string {
  const cleaned = text.replace(/["'`]/g, "").replace(/[\r\n]+/g, " ");
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1) + "\u2026" : cleaned;
}

/** Wrap a Mermaid definition in the correct pre tag for client-side rendering */
export function mermaidBlock(definition: string, extraClass?: string): string {
  const cls = ["mermaid-container", extraClass].filter(Boolean).join(" ");
  return `<div class="${cls}"><pre class="mermaid">\n${definition}\n</pre></div>`;
}

/** Show a placeholder message when there's no data for a diagram */
function placeholder(message: string): string {
  return `<div class="mermaid-container mermaid-empty"><p>${message}</p></div>`;
}

export interface SprintData {
  id: string;
  title: string;
  status: string;
  startDate?: string;
  endDate?: string;
  linkedEpics: string[];
}

export interface EpicData {
  id: string;
  title: string;
  status: string;
  linkedFeature: string[];
}

export interface FeatureData {
  id: string;
  title: string;
  status: string;
}

export interface DiagramData {
  sprints: SprintData[];
  epics: EpicData[];
  features: FeatureData[];
  statusCounts: Record<string, number>;
}

/** Parse a YYYY-MM-DD string to epoch ms */
function toMs(date: string): number {
  return new Date(date + "T00:00:00").getTime();
}

/** Format a date as "Mon DD" */
function fmtDate(ms: number): string {
  const d = new Date(ms);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/** Build an HTML/CSS Gantt chart showing sprints with their linked epics */
export function buildTimelineGantt(data: DiagramData, maxSprints = 6): string {
  const sprintsWithDates = data.sprints
    .filter((s) => s.startDate && s.endDate)
    .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1));
  if (sprintsWithDates.length === 0) {
    return placeholder("No timeline data available — sprints need start and end dates.");
  }

  const truncated = sprintsWithDates.length > maxSprints;
  const visibleSprints = truncated ? sprintsWithDates.slice(-maxSprints) : sprintsWithDates;
  const hiddenCount = sprintsWithDates.length - visibleSprints.length;

  const epicMap = new Map(data.epics.map((e) => [e.id, e]));

  // Calculate timeline bounds
  const allStarts = visibleSprints.map((s) => toMs(s.startDate!));
  const allEnds = visibleSprints.map((s) => toMs(s.endDate!));
  const timelineStart = Math.min(...allStarts);
  const timelineEnd = Math.max(...allEnds);
  const span = timelineEnd - timelineStart || 1;

  const pct = (ms: number) => ((ms - timelineStart) / span) * 100;

  // Build date markers (weekly ticks)
  const DAY = 86400000;
  const markers: string[] = [];
  // Start on the nearest Monday at or after timelineStart
  let tick = timelineStart;
  const startDay = new Date(tick).getDay();
  tick += ((8 - startDay) % 7) * DAY;
  while (tick <= timelineEnd) {
    const left = pct(tick);
    markers.push(
      `<div class="gantt-marker" style="left:${left.toFixed(2)}%"><span>${fmtDate(tick)}</span></div>`,
    );
    tick += 7 * DAY;
  }

  // Today marker
  const now = Date.now();
  let todayMarker = "";
  if (now >= timelineStart && now <= timelineEnd) {
    todayMarker = `<div class="gantt-today" style="left:${pct(now).toFixed(2)}%"></div>`;
  }

  // Build rows
  const rows: string[] = [];
  for (const sprint of visibleSprints) {
    const sStart = toMs(sprint.startDate!);
    const sEnd = toMs(sprint.endDate!);

    // Section header row
    rows.push(`<div class="gantt-section-row">
      <div class="gantt-label gantt-section-label">${sanitize(sprint.id + " " + sprint.title, 50)}</div>
      <div class="gantt-track">
        <div class="gantt-section-bg" style="left:${pct(sStart).toFixed(2)}%;width:${(pct(sEnd) - pct(sStart)).toFixed(2)}%"></div>
      </div>
    </div>`);

    const linked = sprint.linkedEpics
      .map((eid) => epicMap.get(eid))
      .filter(Boolean) as EpicData[];

    const items = linked.length > 0
      ? linked.map((e) => ({ label: sanitize(e.id + " " + e.title), status: e.status }))
      : [{ label: sanitize(sprint.title), status: sprint.status }];

    for (const item of items) {
      const cls =
        item.status === "done" || item.status === "completed" ? "gantt-bar-done"
        : item.status === "in-progress" || item.status === "active" ? "gantt-bar-active"
        : item.status === "blocked" ? "gantt-bar-blocked"
        : "gantt-bar-default";

      const left = pct(sStart).toFixed(2);
      const width = (pct(sEnd) - pct(sStart)).toFixed(2);

      rows.push(`<div class="gantt-row">
        <div class="gantt-label">${item.label}</div>
        <div class="gantt-track">
          <div class="gantt-bar ${cls}" style="left:${left}%;width:${width}%"></div>
        </div>
      </div>`);
    }
  }

  const note = truncated
    ? `<div class="mermaid-note">${hiddenCount} earlier sprint${hiddenCount > 1 ? "s" : ""} not shown</div>`
    : "";

  return `${note}
    <div class="gantt">
      <div class="gantt-chart">
        <div class="gantt-header">
          <div class="gantt-label"></div>
          <div class="gantt-track gantt-dates">${markers.join("")}</div>
        </div>
        ${rows.join("\n")}
      </div>
      <div class="gantt-overlay">
        <div class="gantt-label"></div>
        <div class="gantt-track">${todayMarker}</div>
      </div>
    </div>`;
}

/** Map a status string to a CSS modifier class */
function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "done" || s === "completed") return "flow-done";
  if (s === "in-progress" || s === "active") return "flow-active";
  if (s === "blocked") return "flow-blocked";
  return "flow-default";
}

/** Build an HTML three-column flow showing Feature → Epic → Sprint relationships */
export function buildArtifactFlowchart(data: DiagramData): string {
  if (data.features.length === 0 && data.epics.length === 0) {
    return placeholder("No artifact relationships found — create features and epics to see the hierarchy.");
  }

  // Collect edges for the SVG lines
  const edges: { from: string; to: string }[] = [];

  // Build feature → epic edges
  const epicsByFeature = new Map<string, string[]>();
  for (const epic of data.epics) {
    for (const fid of epic.linkedFeature) {
      if (!epicsByFeature.has(fid)) epicsByFeature.set(fid, []);
      epicsByFeature.get(fid)!.push(epic.id);
      edges.push({ from: fid, to: epic.id });
    }
  }

  // Build epic → sprint edges
  const sprintsByEpic = new Map<string, string[]>();
  for (const sprint of data.sprints) {
    for (const eid of sprint.linkedEpics) {
      if (!sprintsByEpic.has(eid)) sprintsByEpic.set(eid, []);
      sprintsByEpic.get(eid)!.push(sprint.id);
      edges.push({ from: eid, to: sprint.id });
    }
  }

  // Only show connected items
  const connectedFeatureIds = new Set(epicsByFeature.keys());
  const connectedEpicIds = new Set<string>();
  for (const ids of epicsByFeature.values()) ids.forEach((id) => connectedEpicIds.add(id));
  for (const ids of sprintsByEpic.values()) ids.forEach(() => {});
  // Also include epics that link to sprints
  for (const eid of sprintsByEpic.keys()) connectedEpicIds.add(eid);
  const connectedSprintIds = new Set<string>();
  for (const ids of sprintsByEpic.values()) ids.forEach((id) => connectedSprintIds.add(id));

  const features = data.features.filter((f) => connectedFeatureIds.has(f.id));
  const epics = data.epics.filter((e) => connectedEpicIds.has(e.id));
  const sprints = data.sprints
    .filter((s) => connectedSprintIds.has(s.id))
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  if (features.length === 0 && epics.length === 0) {
    return placeholder("No artifact relationships found — link epics to features and sprints.");
  }

  const renderNode = (id: string, title: string, status: string, type: string) =>
    `<div class="flow-node ${statusClass(status)}" data-flow-id="${id}">
      <a class="flow-node-id" href="/docs/${type}/${id}">${id}</a>
      <span class="flow-node-title">${sanitize(title, 35)}</span>
    </div>`;

  const featuresHtml = features.map((f) => renderNode(f.id, f.title, f.status, "feature")).join("\n");
  const epicsHtml = epics.map((e) => renderNode(e.id, e.title, e.status, "epic")).join("\n");
  const sprintsHtml = sprints.map((s) => renderNode(s.id, s.title, s.status, "sprint")).join("\n");

  const edgesJson = JSON.stringify(edges);

  return `
    <div class="flow-diagram" id="flow-diagram">
      <svg class="flow-lines" id="flow-lines"></svg>
      <div class="flow-columns">
        <div class="flow-column">
          <div class="flow-column-header">Features</div>
          ${featuresHtml}
        </div>
        <div class="flow-column">
          <div class="flow-column-header">Epics</div>
          ${epicsHtml}
        </div>
        <div class="flow-column">
          <div class="flow-column-header">Sprints</div>
          ${sprintsHtml}
        </div>
      </div>
    </div>
    <script>
    (function() {
      var edges = ${edgesJson};
      var container = document.getElementById('flow-diagram');
      var svg = document.getElementById('flow-lines');
      if (!container || !svg) return;

      // Build directed adjacency maps for traversal
      var fwd = {};   // from → [to] (Feature→Epic, Epic→Sprint)
      var bwd = {};   // to → [from] (Sprint→Epic, Epic→Feature)
      edges.forEach(function(e) {
        if (!fwd[e.from]) fwd[e.from] = [];
        if (!bwd[e.to]) bwd[e.to] = [];
        fwd[e.from].push(e.to);
        bwd[e.to].push(e.from);
      });

      function drawLines() {
        var rect = container.getBoundingClientRect();
        svg.setAttribute('width', rect.width);
        svg.setAttribute('height', rect.height);
        svg.innerHTML = '';

        edges.forEach(function(edge) {
          var fromEl = container.querySelector('[data-flow-id="' + edge.from + '"]');
          var toEl = container.querySelector('[data-flow-id="' + edge.to + '"]');
          if (!fromEl || !toEl) return;

          var fr = fromEl.getBoundingClientRect();
          var tr = toEl.getBoundingClientRect();
          var x1 = fr.right - rect.left;
          var y1 = fr.top + fr.height / 2 - rect.top;
          var x2 = tr.left - rect.left;
          var y2 = tr.top + tr.height / 2 - rect.top;
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

      // Find directly related nodes via directed traversal
      // Follows forward edges (Feature→Epic→Sprint) and backward edges
      // (Sprint→Epic→Feature) separately to avoid sideways expansion
      function findConnected(startId) {
        var visited = {};
        visited[startId] = true;
        // Traverse forward (from→to direction)
        var queue = [startId];
        while (queue.length) {
          var id = queue.shift();
          (fwd[id] || []).forEach(function(neighbor) {
            if (!visited[neighbor]) {
              visited[neighbor] = true;
              queue.push(neighbor);
            }
          });
        }
        // Traverse backward (to→from direction)
        queue = [startId];
        while (queue.length) {
          var id = queue.shift();
          (bwd[id] || []).forEach(function(neighbor) {
            if (!visited[neighbor]) {
              visited[neighbor] = true;
              queue.push(neighbor);
            }
          });
        }
        return visited;
      }

      function highlight(hoveredId) {
        var connected = findConnected(hoveredId);
        container.querySelectorAll('.flow-node').forEach(function(n) {
          if (connected[n.dataset.flowId]) {
            n.classList.add('flow-lit');
            n.classList.remove('flow-dim');
          } else {
            n.classList.add('flow-dim');
            n.classList.remove('flow-lit');
          }
        });
        svg.querySelectorAll('path').forEach(function(p) {
          if (connected[p.dataset.from] && connected[p.dataset.to]) {
            p.classList.add('flow-line-lit');
            p.classList.remove('flow-line-dim');
          } else {
            p.classList.add('flow-line-dim');
            p.classList.remove('flow-line-lit');
          }
        });
      }

      function clearHighlight() {
        container.querySelectorAll('.flow-node').forEach(function(n) { n.classList.remove('flow-lit', 'flow-dim'); });
        svg.querySelectorAll('path').forEach(function(p) { p.classList.remove('flow-line-lit', 'flow-line-dim'); });
      }

      var activeId = null;
      container.addEventListener('click', function(e) {
        // Let the ID link navigate normally
        if (e.target.closest('a')) return;

        var node = e.target.closest('.flow-node');
        var clickedId = node ? node.dataset.flowId : null;

        if (!clickedId || clickedId === activeId) {
          activeId = null;
          clearHighlight();
          return;
        }

        activeId = clickedId;
        highlight(clickedId);
      });

      requestAnimationFrame(function() { setTimeout(drawLines, 100); });
      window.addEventListener('resize', drawLines);
    })();
    </script>`;
}

/** Build a pie chart for status distribution */
export function buildStatusPie(title: string, counts: Record<string, number>): string {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  if (entries.length === 0) {
    return placeholder(`No data for ${title}.`);
  }

  const lines: string[] = [`pie title ${sanitize(title, 60)}`];
  for (const [label, count] of entries) {
    lines.push(`  "${sanitize(label, 30)}" : ${count}`);
  }

  return mermaidBlock(lines.join("\n"));
}

/** Build small pie charts showing completeness % per category */
export function buildHealthGauge(
  categories: { name: string; complete: number; total: number }[],
): string {
  const valid = categories.filter((c) => c.total > 0);
  if (valid.length === 0) {
    return placeholder("No completeness data available.");
  }

  const pies = valid.map((cat) => {
    const incomplete = cat.total - cat.complete;
    const lines = [
      `pie title ${sanitize(cat.name, 30)}`,
      `  "Complete" : ${cat.complete}`,
      `  "Incomplete" : ${incomplete}`,
    ];
    return mermaidBlock(lines.join("\n"));
  });

  return `<div class="mermaid-row">${pies.join("\n")}</div>`;
}

/** Extract diagram data from raw documents */
export function extractDiagramData(docs: Document[]): DiagramData {
  const sprints: SprintData[] = [];
  const epics: EpicData[] = [];
  const features: FeatureData[] = [];
  const statusCounts: Record<string, number> = {};

  for (const doc of docs) {
    const fm = doc.frontmatter;
    const status = fm.status.toLowerCase();
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    switch (fm.type) {
      case "sprint":
        sprints.push({
          id: fm.id,
          title: fm.title,
          status: fm.status,
          startDate: fm.startDate as string | undefined,
          endDate: fm.endDate as string | undefined,
          linkedEpics: (fm.linkedEpics as string[]) ?? [],
        });
        break;
      case "epic":
        epics.push({
          id: fm.id,
          title: fm.title,
          status: fm.status,
          linkedFeature: normalizeLinkedFeatures(fm.linkedFeature),
        });
        break;
      case "feature":
        features.push({
          id: fm.id,
          title: fm.title,
          status: fm.status,
        });
        break;
    }
  }

  return { sprints, epics, features, statusCounts };
}
