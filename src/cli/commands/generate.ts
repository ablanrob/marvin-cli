import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { loadProject } from "../../core/project.js";
import { getDefaultClaudeMdContent } from "../../templates/claude-md.js";

export async function generateClaudeMdCommand(options: {
  force?: boolean;
}): Promise<void> {
  const project = loadProject();
  const filePath = path.join(project.marvinDir, "CLAUDE.md");

  if (fs.existsSync(filePath) && !options.force) {
    const overwrite = await confirm({
      message: ".marvin/CLAUDE.md already exists. Overwrite?",
      default: false,
    });
    if (!overwrite) {
      console.log(chalk.dim("Aborted."));
      return;
    }
  }

  fs.writeFileSync(
    filePath,
    getDefaultClaudeMdContent(project.config.name),
    "utf-8",
  );

  console.log(chalk.green("Created .marvin/CLAUDE.md"));
}
