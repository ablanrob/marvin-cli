import type { Document } from "../../storage/types.js";
import { normalizeLinkedFeatures } from "../../plugins/builtin/tools/epic-utils.js";

/** Sanitize a string for use in Mermaid labels — strip quotes and limit length */
function sanitize(text: string, maxLen = 40): string {
  const cleaned = text.replace(/["'`]/g, "").replace(/[\r\n]+/g, " ");
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1) + "\u2026" : cleaned;
}

/** Wrap a Mermaid definition in the correct pre tag for client-side rendering */
export function mermaidBlock(definition: string): string {
  return `<div class="mermaid-container"><pre class="mermaid">\n${definition}\n</pre></div>`;
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

/** Build a Gantt chart showing sprints as sections with their linked epics */
export function buildTimelineGantt(data: DiagramData): string {
  const sprintsWithDates = data.sprints.filter((s) => s.startDate && s.endDate);
  if (sprintsWithDates.length === 0) {
    return placeholder("No timeline data available — sprints need start and end dates.");
  }

  const epicMap = new Map(data.epics.map((e) => [e.id, e]));
  const lines: string[] = ["gantt", "  title Project Timeline", "  dateFormat YYYY-MM-DD"];

  for (const sprint of sprintsWithDates) {
    lines.push(`  section ${sanitize(sprint.id + " " + sprint.title, 50)}`);

    const linked = sprint.linkedEpics
      .map((eid) => epicMap.get(eid))
      .filter(Boolean) as EpicData[];

    if (linked.length === 0) {
      // Show the sprint itself as a milestone
      lines.push(`    ${sanitize(sprint.title)} :${sprint.startDate}, ${sprint.endDate}`);
    } else {
      for (const epic of linked) {
        const tag = epic.status === "in-progress" ? "active, " : epic.status === "done" ? "done, " : "";
        lines.push(`    ${sanitize(epic.id + " " + epic.title)} :${tag}${sprint.startDate}, ${sprint.endDate}`);
      }
    }
  }

  return mermaidBlock(lines.join("\n"));
}

/** Build a flowchart showing Feature -> Epic -> Sprint relationships */
export function buildArtifactFlowchart(data: DiagramData): string {
  if (data.features.length === 0 && data.epics.length === 0) {
    return placeholder("No artifact relationships found — create features and epics to see the hierarchy.");
  }

  const lines: string[] = ["graph TD"];

  // Style classes for status coloring
  lines.push("  classDef done fill:#065f46,stroke:#34d399,color:#d1fae5");
  lines.push("  classDef inprogress fill:#78350f,stroke:#fbbf24,color:#fef3c7");
  lines.push("  classDef blocked fill:#7f1d1d,stroke:#f87171,color:#fee2e2");
  lines.push("  classDef default fill:#1e293b,stroke:#475569,color:#e2e8f0");

  const nodeIds = new Set<string>();

  // Feature -> Epic edges
  for (const epic of data.epics) {
    for (const featureId of epic.linkedFeature) {
      const feature = data.features.find((f) => f.id === featureId);
      if (feature) {
        const fNode = feature.id.replace(/-/g, "_");
        const eNode = epic.id.replace(/-/g, "_");
        if (!nodeIds.has(fNode)) {
          lines.push(`  ${fNode}["${sanitize(feature.id + " " + feature.title)}"]`);
          nodeIds.add(fNode);
        }
        if (!nodeIds.has(eNode)) {
          lines.push(`  ${eNode}["${sanitize(epic.id + " " + epic.title)}"]`);
          nodeIds.add(eNode);
        }
        lines.push(`  ${fNode} --> ${eNode}`);
      }
    }
  }

  // Epic -> Sprint edges
  for (const sprint of data.sprints) {
    const sNode = sprint.id.replace(/-/g, "_");
    for (const epicId of sprint.linkedEpics) {
      const epic = data.epics.find((e) => e.id === epicId);
      if (epic) {
        const eNode = epic.id.replace(/-/g, "_");
        if (!nodeIds.has(eNode)) {
          lines.push(`  ${eNode}["${sanitize(epic.id + " " + epic.title)}"]`);
          nodeIds.add(eNode);
        }
        if (!nodeIds.has(sNode)) {
          lines.push(`  ${sNode}["${sanitize(sprint.id + " " + sprint.title)}"]`);
          nodeIds.add(sNode);
        }
        lines.push(`  ${eNode} --> ${sNode}`);
      }
    }
  }

  if (nodeIds.size === 0) {
    return placeholder("No artifact relationships found — link epics to features and sprints.");
  }

  // Apply status classes
  const allItems = [
    ...data.features.map((f) => ({ id: f.id, status: f.status })),
    ...data.epics.map((e) => ({ id: e.id, status: e.status })),
    ...data.sprints.map((s) => ({ id: s.id, status: s.status })),
  ];

  for (const item of allItems) {
    const node = item.id.replace(/-/g, "_");
    if (!nodeIds.has(node)) continue;
    const cls =
      item.status === "done" || item.status === "completed"
        ? "done"
        : item.status === "in-progress" || item.status === "active"
          ? "inprogress"
          : item.status === "blocked"
            ? "blocked"
            : null;
    if (cls) {
      lines.push(`  class ${node} ${cls}`);
    }
  }

  return mermaidBlock(lines.join("\n"));
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
