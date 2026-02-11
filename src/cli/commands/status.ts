import chalk from "chalk";
import { loadProject } from "../../core/project.js";
import { DocumentStore } from "../../storage/store.js";
import { resolvePlugin } from "../../plugins/registry.js";

export async function statusCommand(): Promise<void> {
  const project = loadProject();
  const plugin = resolvePlugin(project.config.methodology);
  const registrations = plugin?.documentTypeRegistrations ?? [];
  const store = new DocumentStore(project.marvinDir, registrations);
  const counts = store.counts();

  console.log(chalk.bold(`\nProject: ${project.config.name}\n`));

  const openDecisions = store.list({ type: "decision", status: "open" });
  const openActions = store.list({ type: "action", status: "open" });
  const openQuestions = store.list({ type: "question", status: "open" });

  console.log(chalk.underline("Document Counts:"));
  console.log(`  Decisions:  ${counts.decision} total, ${openDecisions.length} open`);
  console.log(`  Actions:    ${counts.action} total, ${openActions.length} open`);
  console.log(`  Questions:  ${counts.question} total, ${openQuestions.length} open`);
  console.log(`  Meetings:   ${counts.meeting ?? 0} total`);

  // Show plugin-registered types beyond the common ones
  const coreAndCommon = new Set(["decision", "action", "question", "meeting", "report", "feature", "epic"]);
  for (const type of store.registeredTypes) {
    if (coreAndCommon.has(type)) continue;
    const label = type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    console.log(`  ${label}:  ${counts[type] ?? 0} total`);
  }

  if (openActions.length > 0) {
    console.log(chalk.underline("\nOpen Actions:"));
    for (const doc of openActions) {
      const owner = doc.frontmatter.owner
        ? chalk.dim(` (${doc.frontmatter.owner})`)
        : "";
      const priority = doc.frontmatter.priority
        ? chalk.yellow(` [${doc.frontmatter.priority}]`)
        : "";
      console.log(
        `  ${chalk.cyan(doc.frontmatter.id)} ${doc.frontmatter.title}${priority}${owner}`,
      );
    }
  }

  if (openQuestions.length > 0) {
    console.log(chalk.underline("\nOpen Questions:"));
    for (const doc of openQuestions) {
      const owner = doc.frontmatter.owner
        ? chalk.dim(` (${doc.frontmatter.owner})`)
        : "";
      console.log(
        `  ${chalk.cyan(doc.frontmatter.id)} ${doc.frontmatter.title}${owner}`,
      );
    }
  }

  if (openDecisions.length > 0) {
    console.log(chalk.underline("\nOpen Decisions:"));
    for (const doc of openDecisions) {
      console.log(
        `  ${chalk.cyan(doc.frontmatter.id)} ${doc.frontmatter.title}`,
      );
    }
  }

  console.log();
}
