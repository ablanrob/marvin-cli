import chalk from "chalk";
import type { HealthReport, HealthStatus } from "./types.js";

const STATUS_DOT: Record<HealthStatus, string> = {
  green: chalk.green("●"),
  amber: chalk.yellow("●"),
  red: chalk.red("●"),
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  green: chalk.green.bold("GREEN"),
  amber: chalk.yellow.bold("AMBER"),
  red: chalk.red.bold("RED"),
};

const SEPARATOR = chalk.dim("─".repeat(60));

export function renderAscii(report: HealthReport): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(chalk.bold(`  Health Check · ${report.projectName}`));
  lines.push(chalk.dim(`  ${report.generatedAt}`));
  lines.push("");
  lines.push(`  Overall:  ${STATUS_LABEL[report.overall]}`);
  lines.push("");
  lines.push(`  ${SEPARATOR}`);
  lines.push(chalk.bold("  Completeness"));
  lines.push(`  ${SEPARATOR}`);

  for (const cat of report.completeness) {
    lines.push(`  ${STATUS_DOT[cat.status]} ${chalk.bold(cat.name.padEnd(16))} ${cat.summary}`);
    for (const item of cat.items) {
      lines.push(`    ${chalk.dim("└")} ${item.id} ${chalk.dim(item.detail)}`);
    }
  }

  lines.push("");
  lines.push(`  ${SEPARATOR}`);
  lines.push(chalk.bold("  Process"));
  lines.push(`  ${SEPARATOR}`);

  for (const cat of report.process) {
    lines.push(`  ${STATUS_DOT[cat.status]} ${chalk.bold(cat.name.padEnd(22))} ${cat.summary}`);
    for (const item of cat.items) {
      lines.push(`    ${chalk.dim("└")} ${item.id} ${chalk.dim(item.detail)}`);
    }
  }

  lines.push(`  ${SEPARATOR}`);
  lines.push("");

  return lines.join("\n");
}
