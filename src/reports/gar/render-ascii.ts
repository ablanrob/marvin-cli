import chalk from "chalk";
import type { GarReport, GarStatus } from "./types.js";

const STATUS_DOT: Record<GarStatus, string> = {
  green: chalk.green("●"),
  amber: chalk.yellow("●"),
  red: chalk.red("●"),
};

const STATUS_LABEL: Record<GarStatus, string> = {
  green: chalk.green.bold("GREEN"),
  amber: chalk.yellow.bold("AMBER"),
  red: chalk.red.bold("RED"),
};

const SEPARATOR = chalk.dim("─".repeat(60));

export function renderAscii(report: GarReport): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(chalk.bold(`  GAR Report · ${report.projectName}`));
  lines.push(chalk.dim(`  ${report.generatedAt}`));
  lines.push("");
  lines.push(`  Overall:  ${STATUS_LABEL[report.overall]}`);
  lines.push("");
  lines.push(`  ${SEPARATOR}`);

  for (const area of report.areas) {
    lines.push(`  ${STATUS_DOT[area.status]} ${chalk.bold(area.name.padEnd(12))} ${area.summary}`);
    for (const item of area.items) {
      lines.push(`    ${chalk.dim("└")} ${item.id} ${item.title}`);
    }
  }

  lines.push(`  ${SEPARATOR}`);
  lines.push("");

  return lines.join("\n");
}
