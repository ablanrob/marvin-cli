import type { HealthReport, HealthStatus } from "./types.js";

const EMOJI: Record<HealthStatus, string> = {
  green: ":green_circle:",
  amber: ":yellow_circle:",
  red: ":red_circle:",
};

export function renderConfluence(report: HealthReport): string {
  const lines: string[] = [];

  lines.push(`# Health Check — ${report.projectName}`);
  lines.push("");
  lines.push(`**Date:** ${report.generatedAt}`);
  lines.push(`**Overall:** ${EMOJI[report.overall]} ${report.overall.toUpperCase()}`);
  lines.push("");

  // Completeness section
  lines.push("## Completeness");
  lines.push("");
  lines.push("| Category | Status | Summary |");
  lines.push("|----------|--------|---------|");

  for (const cat of report.completeness) {
    lines.push(
      `| ${cat.name} | ${EMOJI[cat.status]} ${cat.status.toUpperCase()} | ${cat.summary} |`,
    );
  }

  lines.push("");

  for (const cat of report.completeness) {
    if (cat.items.length === 0) continue;
    lines.push(`### ${cat.name}`);
    lines.push("");
    for (const item of cat.items) {
      lines.push(`- **${item.id}** ${item.detail}`);
    }
    lines.push("");
  }

  // Process section
  lines.push("## Process");
  lines.push("");
  lines.push("| Metric | Status | Summary |");
  lines.push("|--------|--------|---------|");

  for (const cat of report.process) {
    lines.push(
      `| ${cat.name} | ${EMOJI[cat.status]} ${cat.status.toUpperCase()} | ${cat.summary} |`,
    );
  }

  lines.push("");

  for (const cat of report.process) {
    if (cat.items.length === 0) continue;
    lines.push(`### ${cat.name}`);
    lines.push("");
    for (const item of cat.items) {
      lines.push(`- **${item.id}** ${item.detail}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
