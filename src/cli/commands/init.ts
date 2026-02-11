import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";
import chalk from "chalk";
import { input, confirm, select } from "@inquirer/prompts";
import { isMarvinProject } from "../../core/project.js";
import { resolvePlugin } from "../../plugins/registry.js";

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();

  if (isMarvinProject(cwd)) {
    console.log(
      chalk.yellow("A .marvin/ project already exists in this directory tree."),
    );
    return;
  }

  const projectName = await input({
    message: "Project name:",
    default: path.basename(cwd),
  });

  const methodology = await select({
    message: "Methodology:",
    choices: [
      { value: "generic-agile", name: "Generic Agile (default)" },
      { value: "sap-aem", name: "SAP Application Extension Methodology" },
    ],
    default: "generic-agile",
  });

  const plugin = resolvePlugin(methodology);
  const registrations = plugin?.documentTypeRegistrations ?? [];

  const marvinDir = path.join(cwd, ".marvin");

  // Core dirs always created
  const dirs = [
    marvinDir,
    path.join(marvinDir, "templates"),
    path.join(marvinDir, "docs", "decisions"),
    path.join(marvinDir, "docs", "actions"),
    path.join(marvinDir, "docs", "questions"),
    path.join(marvinDir, "sources"),
    path.join(marvinDir, "skills"),
  ];

  // Plugin-registered dirs
  for (const reg of registrations) {
    dirs.push(path.join(marvinDir, "docs", reg.dirName));
  }

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const config: Record<string, unknown> = {
    name: projectName,
    methodology,
    personas: {
      "product-owner": { enabled: true },
      "delivery-manager": { enabled: true },
      "tech-lead": { enabled: true },
    },
  };

  if (methodology === "sap-aem") {
    config.aem = { currentPhase: "assess-use-case" };
  }

  fs.writeFileSync(
    path.join(marvinDir, "config.yaml"),
    YAML.stringify(config),
    "utf-8",
  );

  console.log(chalk.green(`\nInitialized Marvin project "${projectName}" in ${cwd}`));
  console.log(chalk.dim(`Methodology: ${plugin?.name ?? methodology}`));
  console.log(chalk.dim("\nCreated:"));
  console.log(chalk.dim("  .marvin/config.yaml"));
  console.log(chalk.dim("  .marvin/docs/decisions/"));
  console.log(chalk.dim("  .marvin/docs/actions/"));
  console.log(chalk.dim("  .marvin/docs/questions/"));
  for (const reg of registrations) {
    console.log(chalk.dim(`  .marvin/docs/${reg.dirName}/`));
  }
  console.log(chalk.dim("  .marvin/sources/"));
  console.log(chalk.dim("  .marvin/skills/"));
  console.log(chalk.dim("  .marvin/templates/"));

  // Bootstrap source documents
  const hasSources = await confirm({
    message: "Do you have existing source documents (PDFs, markdown, text) to import?",
    default: false,
  });

  if (hasSources) {
    const sourceDir = await input({
      message: "Path to directory containing source documents:",
    });

    const resolvedDir = path.resolve(sourceDir);
    if (fs.existsSync(resolvedDir) && fs.statSync(resolvedDir).isDirectory()) {
      const sourceExts = [".pdf", ".md", ".txt"];
      const files = fs.readdirSync(resolvedDir).filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return sourceExts.includes(ext);
      });

      let copied = 0;
      for (const file of files) {
        const src = path.join(resolvedDir, file);
        const dest = path.join(marvinDir, "sources", file);
        fs.copyFileSync(src, dest);
        copied++;
      }

      if (copied > 0) {
        console.log(chalk.green(`\nCopied ${copied} source document${copied === 1 ? "" : "s"} to .marvin/sources/`));
        console.log(chalk.dim('Run "marvin ingest --all" to process them.'));
      } else {
        console.log(chalk.yellow("\nNo supported files found (.pdf, .md, .txt)."));
      }
    } else {
      console.log(chalk.yellow(`\nDirectory not found: ${resolvedDir}`));
    }
  }

  console.log(
    chalk.dim('\nRun "marvin chat --as po" to start talking to your Product Owner.'),
  );
}
