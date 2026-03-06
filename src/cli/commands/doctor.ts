import chalk from "chalk";
import { loadProject } from "../../core/project.js";
import { resolvePlugin } from "../../plugins/registry.js";
import { DocumentStore } from "../../storage/store.js";
import { runDoctorScan, runDoctorFix } from "../../doctor/engine.js";
import type { DoctorReport, DoctorIssue } from "../../doctor/types.js";
import { loadAllSkills, collectSkillRegistrations } from "../../skills/registry.js";

const SEVERITY_ICONS: Record<string, string> = {
  error: chalk.red("x"),
  warning: chalk.yellow("!"),
  info: chalk.blue("i"),
};

export async function doctorCommand(options: {
  fix?: boolean;
  rule?: string;
}): Promise<void> {
  const project = loadProject();
  const plugin = resolvePlugin(project.config.methodology);
  const pluginRegistrations = plugin?.documentTypeRegistrations ?? [];
  const allSkills = loadAllSkills(project.marvinDir);
  const allSkillIds = [...allSkills.keys()];
  const skillRegistrations = collectSkillRegistrations(allSkillIds, allSkills);
  const store = new DocumentStore(project.marvinDir, [
    ...pluginRegistrations,
    ...skillRegistrations,
  ]);

  const report = options.fix
    ? runDoctorFix(store, options.rule)
    : runDoctorScan(store, options.rule);

  printReport(report, !!options.fix);
}

function printReport(report: DoctorReport, didFix: boolean): void {
  console.log(chalk.bold(`\nArtifact Doctor\n`));
  console.log(`Scanned ${report.totalDocuments} documents\n`);

  if (report.issues.length === 0) {
    console.log(chalk.green("No issues found. All documents are healthy.\n"));
    return;
  }

  // Group by document
  const byDoc = new Map<string, DoctorIssue[]>();
  for (const issue of report.issues) {
    const key = issue.documentId;
    if (!byDoc.has(key)) byDoc.set(key, []);
    byDoc.get(key)!.push(issue);
  }

  for (const [docId, issues] of byDoc) {
    const first = issues[0];
    console.log(chalk.cyan(docId) + chalk.dim(` (${first.documentType})`));
    for (const issue of issues) {
      const icon = SEVERITY_ICONS[issue.severity] ?? " ";
      const fixLabel = issue.fixable ? chalk.dim(" [fixable]") : "";
      console.log(`  ${icon} ${issue.message}${fixLabel}`);
    }
    console.log();
  }

  // Summary
  console.log(chalk.underline("Summary"));
  console.log(`  Total issues: ${report.summary.totalIssues}`);
  console.log(`  Fixable:      ${report.summary.fixableIssues}`);

  if (didFix) {
    console.log(chalk.green(`  Fixed:        ${report.summary.fixedIssues}`));
  }

  const { bySeverity } = report.summary;
  if (bySeverity.error > 0) console.log(chalk.red(`  Errors:       ${bySeverity.error}`));
  if (bySeverity.warning > 0) console.log(chalk.yellow(`  Warnings:     ${bySeverity.warning}`));
  if (bySeverity.info > 0) console.log(chalk.blue(`  Info:         ${bySeverity.info}`));

  if (!didFix && report.summary.fixableIssues > 0) {
    console.log(chalk.dim(`\nRun "marvin doctor --fix" to auto-repair fixable issues.`));
  }

  console.log();
}
