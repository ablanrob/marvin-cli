import type { GarReport, GarStatus } from "./types.js";

const EMOJI: Record<GarStatus, string> = {
  green: ":green_circle:",
  amber: ":yellow_circle:",
  red: ":red_circle:",
};

export function renderConfluence(report: GarReport): string {
  const lines: string[] = [];

  lines.push(`# GAR Report — ${report.projectName}`);
  lines.push("");
  lines.push(`**Date:** ${report.generatedAt}`);
  lines.push(`**Overall:** ${EMOJI[report.overall]} ${report.overall.toUpperCase()}`);
  lines.push("");
  lines.push("| Area | Status | Summary |");
  lines.push("|------|--------|---------|");

  for (const area of report.areas) {
    lines.push(
      `| ${area.name} | ${EMOJI[area.status]} ${area.status.toUpperCase()} | ${area.summary} |`,
    );
  }

  lines.push("");

  for (const area of report.areas) {
    if (area.items.length === 0 && (area.insights ?? []).length === 0) continue;
    lines.push(`## ${area.name}`);
    lines.push("");
    for (const insight of area.insights ?? []) {
      lines.push(`- _${insight}_`);
    }
    for (const item of area.items) {
      lines.push(`- **${item.id}** ${item.title}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
