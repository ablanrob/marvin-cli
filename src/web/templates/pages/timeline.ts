import type { DiagramDataResult } from "../../data.js";
import { buildTimelineGantt } from "../mermaid.js";

export function timelinePage(diagrams: DiagramDataResult): string {
  return `
    <div class="page-header">
      <h2>Project Timeline</h2>
      <div class="subtitle">Sprint schedule with linked epics</div>
    </div>

    ${buildTimelineGantt(diagrams)}
  `;
}
