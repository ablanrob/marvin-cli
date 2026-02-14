import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";
import matter from "gray-matter";
import chalk from "chalk";
import { loadProject } from "../../core/project.js";
import { loadProjectConfig, saveProjectConfig, type MarvinProjectConfig } from "../../core/config.js";
import { loadAllSkills, listAllSkillInfo, migrateYamlToSkillMd } from "../../skills/registry.js";
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
  const fmtWidth = Math.max(6, ...infos.map((s) => s.format.length));
  const verWidth = Math.max(7, ...infos.map((s) => s.version.length));
  const descWidth = Math.max(11, ...infos.map((s) => s.description.length));

  const header = [
    "ID".padEnd(idWidth),
    "Format".padEnd(fmtWidth),
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
        info.format.padEnd(fmtWidth),
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

  const skillDir = path.join(skillsDir, name);
  if (fs.existsSync(skillDir)) {
    console.log(chalk.yellow(`Skill directory already exists: ${skillDir}`));
    return;
  }

  fs.mkdirSync(skillDir, { recursive: true });

  const displayName = name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Write SKILL.md
  const frontmatter = {
    name,
    description: `Custom skill: ${name}`,
    metadata: {
      version: "1.0.0",
      personas: ["product-owner"],
    },
  };
  const body = `\nYou have the **${displayName}** skill.\n`;
  const skillMd = matter.stringify(body, frontmatter);
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMd, "utf-8");

  // Write actions.yaml
  const actions = [
    {
      id: "run",
      name: `Run ${name}`,
      description: `Execute the ${name} skill`,
      systemPrompt: "You are a helpful assistant. Complete the requested task using the available governance tools.",
      maxTurns: 5,
    },
  ];
  fs.writeFileSync(path.join(skillDir, "actions.yaml"), YAML.stringify(actions), "utf-8");

  console.log(chalk.green(`Created skill: ${skillDir}/`));
  console.log(chalk.dim("  SKILL.md      — skill definition and prompt"));
  console.log(chalk.dim("  actions.yaml  — action definitions"));
  console.log(chalk.dim("\nAdd persona-specific prompts in personas/<persona-id>.md"));
}

export async function skillsMigrateCommand(): Promise<void> {
  const project = loadProject();
  const skillsDir = path.join(project.marvinDir, "skills");

  if (!fs.existsSync(skillsDir)) {
    console.log(chalk.dim("No skills directory found."));
    return;
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(skillsDir);
  } catch {
    console.log(chalk.red("Could not read skills directory."));
    return;
  }

  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  if (yamlFiles.length === 0) {
    console.log(chalk.dim("No YAML skill files to migrate."));
    return;
  }

  let migrated = 0;
  for (const file of yamlFiles) {
    const yamlPath = path.join(skillsDir, file);
    const baseName = file.replace(/\.(yaml|yml)$/, "");
    const outputDir = path.join(skillsDir, baseName);

    if (fs.existsSync(outputDir)) {
      console.log(chalk.yellow(`Skipping "${file}" — directory "${baseName}/" already exists.`));
      continue;
    }

    try {
      migrateYamlToSkillMd(yamlPath, outputDir);
      fs.renameSync(yamlPath, `${yamlPath}.bak`);
      console.log(chalk.green(`Migrated "${file}" → "${baseName}/"`));
      migrated++;
    } catch (err) {
      console.log(chalk.red(`Failed to migrate "${file}": ${err}`));
    }
  }

  if (migrated > 0) {
    console.log(chalk.dim(`\n${migrated} skill(s) migrated. Original files renamed to *.bak`));
  }
}
