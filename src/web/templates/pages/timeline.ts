import type { DiagramDataResult } from "../../data.js";
import { buildTimelineGantt } from "../mermaid.js";

export function timelinePage(diagrams: DiagramDataResult): string {
  return `
    <div class="page-header">
      <h2>Project Timeline</h2>
      <div class="subtitle">Epic timeline across sprints</div>
    </div>

    ${buildTimelineGantt(diagrams)}
  `;
}
