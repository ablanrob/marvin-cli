import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";
import chalk from "chalk";
import { loadProject } from "../../core/project.js";
import { loadProjectConfig, saveProjectConfig, type MarvinProjectConfig } from "../../core/config.js";
import { loadAllSkills, listAllSkillInfo } from "../../skills/registry.js";
import { listPersonas } from "../../personas/registry.js";

export async function skillsListCommand(): Promise<void> {
  const project = loadProject();
  const config = loadProjectConfig(project.marvinDir);
  const allSkills = loadAllSkills(project.marvinDir);
  const personaIds = listPersonas().map((p) => p.id);
  const infos = listAllSkillInfo(allSkills, config.skills, personaIds);

  if (infos.length === 0) {
    console.log(chalk.dim("No skills available."));
    return;
  }

  console.log(chalk.bold("\nAvailable Skills\n"));

  const idWidth = Math.max(5, ...infos.map((s) => s.id.length));
  const verWidth = Math.max(7, ...infos.map((s) => s.version.length));
  const descWidth = Math.max(11, ...infos.map((s) => s.description.length));

  const header = [
    "ID".padEnd(idWidth),
    "Version".padEnd(verWidth),
    "Description".padEnd(descWidth),
    "Personas",
  ].join("  ");
  console.log(chalk.dim(header));
  console.log(chalk.dim("-".repeat(header.length)));

  for (const info of infos) {
    const personas = info.assignedPersonas.length > 0
      ? info.assignedPersonas.join(", ")
      : chalk.dim("(none)");
    console.log(
      [
        info.id.padEnd(idWidth),
        info.version.padEnd(verWidth),
        info.description.padEnd(descWidth),
        personas,
      ].join("  "),
    );
  }
  console.log();
}

export async function skillsInstallCommand(
  skillId: string,
  options: { as: string },
): Promise<void> {
  const project = loadProject();
  const allSkills = loadAllSkills(project.marvinDir);

  if (!allSkills.has(skillId)) {
    console.log(chalk.red(`Skill "${skillId}" not found.`));
    const available = [...allSkills.keys()].join(", ");
    console.log(chalk.dim(`Available: ${available}`));
    return;
  }

  const persona = options.as;
  if (!persona) {
    console.log(chalk.red("Please specify a persona with --as <persona>."));
    return;
  }

  const config = loadProjectConfig(project.marvinDir) as MarvinProjectConfig & { skills?: Record<string, string[]> };
  if (!config.skills) {
    config.skills = {};
  }
  if (!config.skills[persona]) {
    config.skills[persona] = [];
  }
  if (config.skills[persona].includes(skillId)) {
    console.log(chalk.yellow(`Skill "${skillId}" is already assigned to ${persona}.`));
    return;
  }

  config.skills[persona].push(skillId);
  saveProjectConfig(project.marvinDir, config);
  console.log(chalk.green(`Assigned skill "${skillId}" to ${persona}.`));
}

export async function skillsRemoveCommand(
  skillId: string,
  options: { as: string },
): Promise<void> {
  const project = loadProject();

  const persona = options.as;
  if (!persona) {
    console.log(chalk.red("Please specify a persona with --as <persona>."));
    return;
  }

  const config = loadProjectConfig(project.marvinDir) as MarvinProjectConfig & { skills?: Record<string, string[]> };
  if (!config.skills?.[persona]) {
    console.log(chalk.yellow(`No skills configured for ${persona}.`));
    return;
  }

  const idx = config.skills[persona].indexOf(skillId);
  if (idx === -1) {
    console.log(chalk.yellow(`Skill "${skillId}" is not assigned to ${persona}.`));
    return;
  }

  config.skills[persona].splice(idx, 1);
  if (config.skills[persona].length === 0) {
    delete config.skills[persona];
  }
  if (Object.keys(config.skills).length === 0) {
    delete config.skills;
  }
  saveProjectConfig(project.marvinDir, config);
  console.log(chalk.green(`Removed skill "${skillId}" from ${persona}.`));
}

export async function skillsCreateCommand(name: string): Promise<void> {
  const project = loadProject();
  const skillsDir = path.join(project.marvinDir, "skills");
  fs.mkdirSync(skillsDir, { recursive: true });

  const filePath = path.join(skillsDir, `${name}.yaml`);
  if (fs.existsSync(filePath)) {
    console.log(chalk.yellow(`Skill file already exists: ${filePath}`));
    return;
  }

  const template = {
    id: name,
    name: name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: `Custom skill: ${name}`,
    version: "1.0.0",
    personas: ["product-owner"],
    promptFragments: {
      "*": `You have the **${name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}** skill.`,
    },
    actions: [
      {
        id: "run",
        name: `Run ${name}`,
        description: `Execute the ${name} skill`,
        systemPrompt: "You are a helpful assistant. Complete the requested task using the available governance tools.",
        maxTurns: 5,
      },
    ],
  };

  fs.writeFileSync(filePath, YAML.stringify(template), "utf-8");
  console.log(chalk.green(`Created skill template: ${filePath}`));
  console.log(chalk.dim("Edit the YAML file to customize your skill."));
}
