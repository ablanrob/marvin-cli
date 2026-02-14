import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as YAML from "yaml";
import matter from "gray-matter";
import type { AgentDefinition, SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../storage/store.js";
import type { SkillDefinition, SkillInfo } from "./types.js";
import { governanceReviewSkill } from "./builtin/governance-review.js";

const BUILTIN_SKILLS: Record<string, SkillDefinition> = {
  "governance-review": governanceReviewSkill,
};

const GOVERNANCE_TOOL_NAMES = [
  "mcp__marvin-governance__list_decisions",
  "mcp__marvin-governance__get_decision",
  "mcp__marvin-governance__create_decision",
  "mcp__marvin-governance__update_decision",
  "mcp__marvin-governance__list_actions",
  "mcp__marvin-governance__get_action",
  "mcp__marvin-governance__create_action",
  "mcp__marvin-governance__update_action",
  "mcp__marvin-governance__list_questions",
  "mcp__marvin-governance__get_question",
  "mcp__marvin-governance__create_question",
  "mcp__marvin-governance__update_question",
  "mcp__marvin-governance__search_documents",
  "mcp__marvin-governance__read_document",
  "mcp__marvin-governance__project_summary",
];

function getBuiltinSkillsDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.join(path.dirname(thisFile), "builtin");
}

export function loadSkillFromDirectory(dirPath: string): SkillDefinition | undefined {
  const skillMdPath = path.join(dirPath, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) return undefined;

  try {
    const raw = fs.readFileSync(skillMdPath, "utf-8");
    const { data, content } = matter(raw);

    if (!data.name || !data.description) return undefined;

    const metadata = (data.metadata as Record<string, unknown>) ?? {};
    const version = (metadata.version as string) ?? "1.0.0";
    const personas = metadata.personas as string[] | undefined;

    // Load persona-specific prompt fragments
    const promptFragments: Record<string, string> = {};
    const wildcardPrompt = content.trim();
    if (wildcardPrompt) {
      promptFragments["*"] = wildcardPrompt;
    }
    const personasDir = path.join(dirPath, "personas");
    if (fs.existsSync(personasDir)) {
      try {
        for (const file of fs.readdirSync(personasDir)) {
          if (!file.endsWith(".md")) continue;
          const personaId = file.replace(/\.md$/, "");
          const personaPrompt = fs.readFileSync(path.join(personasDir, file), "utf-8").trim();
          if (personaPrompt) {
            promptFragments[personaId] = personaPrompt;
          }
        }
      } catch {
        // Skip unreadable personas dir
      }
    }

    // Load actions
    let actions: SkillDefinition["actions"];
    const actionsPath = path.join(dirPath, "actions.yaml");
    if (fs.existsSync(actionsPath)) {
      try {
        const actionsRaw = fs.readFileSync(actionsPath, "utf-8");
        actions = YAML.parse(actionsRaw) as SkillDefinition["actions"];
      } catch {
        // Skip invalid actions file
      }
    }

    return {
      id: data.name as string,
      name: (data.name as string).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      description: data.description as string,
      version,
      format: "skill-md",
      dirPath,
      personas,
      promptFragments: Object.keys(promptFragments).length > 0 ? promptFragments : undefined,
      actions,
    };
  } catch {
    return undefined;
  }
}

export function loadAllSkills(marvinDir?: string): Map<string, SkillDefinition> {
  const skills = new Map<string, SkillDefinition>();

  // Load builtin TS skills (Phase 1: dual loading)
  for (const [id, skill] of Object.entries(BUILTIN_SKILLS)) {
    skills.set(id, skill);
  }

  // Load builtin SKILL.md directories (only if not already loaded from TS)
  try {
    const builtinDir = getBuiltinSkillsDir();
    if (fs.existsSync(builtinDir)) {
      for (const entry of fs.readdirSync(builtinDir)) {
        const entryPath = path.join(builtinDir, entry);
        if (!fs.statSync(entryPath).isDirectory()) continue;
        if (skills.has(entry)) continue; // TS builtin takes precedence during Phase 1
        const skill = loadSkillFromDirectory(entryPath);
        if (skill) skills.set(skill.id, skill);
      }
    }
  } catch {
    // Skip if builtin dir not found (e.g., in tests)
  }

  if (marvinDir) {
    const skillsDir = path.join(marvinDir, "skills");
    if (fs.existsSync(skillsDir)) {
      let entries: string[];
      try {
        entries = fs.readdirSync(skillsDir);
      } catch {
        entries = [];
      }
      for (const entry of entries) {
        const entryPath = path.join(skillsDir, entry);

        // Check for SKILL.md directories
        try {
          if (fs.statSync(entryPath).isDirectory()) {
            const skill = loadSkillFromDirectory(entryPath);
            if (skill) skills.set(skill.id, skill);
            continue;
          }
        } catch {
          continue;
        }

        // Legacy YAML files
        if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;
        try {
          const raw = fs.readFileSync(entryPath, "utf-8");
          const parsed = YAML.parse(raw) as Record<string, unknown>;
          if (!parsed?.id || !parsed?.name || !parsed?.version) continue;
          const skill: SkillDefinition = {
            id: parsed.id as string,
            name: parsed.name as string,
            description: (parsed.description as string) ?? "",
            version: parsed.version as string,
            format: "yaml",
            personas: parsed.personas as string[] | undefined,
            promptFragments: parsed.promptFragments as Record<string, string> | undefined,
            actions: parsed.actions as SkillDefinition["actions"],
          };
          skills.set(skill.id, skill);
        } catch {
          // Skip invalid YAML files
        }
      }
    }
  }

  return skills;
}

export function resolveSkillsForPersona(
  personaId: string,
  skillsConfig: Record<string, string[]> | undefined,
  allSkills: Map<string, SkillDefinition>,
): string[] {
  if (skillsConfig?.[personaId]) {
    return skillsConfig[personaId].filter((id) => allSkills.has(id));
  }
  const result: string[] = [];
  for (const [id, skill] of allSkills) {
    if (skill.personas?.includes(personaId)) {
      result.push(id);
    }
  }
  return result;
}

export function getSkillTools(
  skillIds: string[],
  allSkills: Map<string, SkillDefinition>,
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  const tools: SdkMcpToolDefinition<any>[] = [];
  for (const id of skillIds) {
    const skill = allSkills.get(id);
    if (skill?.tools) {
      tools.push(...skill.tools(store));
    }
  }
  return tools;
}

export function getSkillPromptFragment(
  skillIds: string[],
  allSkills: Map<string, SkillDefinition>,
  personaId: string,
): string | undefined {
  const fragments: string[] = [];
  for (const id of skillIds) {
    const skill = allSkills.get(id);
    if (!skill?.promptFragments) continue;
    const fragment =
      skill.promptFragments[personaId] ?? skill.promptFragments["*"];
    if (fragment) {
      fragments.push(`### ${skill.name}\n${fragment}`);
    }
  }
  return fragments.length > 0 ? fragments.join("\n\n") : undefined;
}

export function listAllSkillInfo(
  allSkills: Map<string, SkillDefinition>,
  skillsConfig: Record<string, string[]> | undefined,
  personaIds: string[],
): SkillInfo[] {
  const result: SkillInfo[] = [];
  for (const [, skill] of allSkills) {
    const assignedPersonas: string[] = [];
    for (const pid of personaIds) {
      const resolved = resolveSkillsForPersona(pid, skillsConfig, allSkills);
      if (resolved.includes(skill.id)) {
        assignedPersonas.push(pid);
      }
    }
    result.push({
      id: skill.id,
      name: skill.name,
      version: skill.version,
      description: skill.description,
      format: skill.format,
      assignedPersonas,
    });
  }
  return result;
}

export function getSkillAgentDefinitions(
  skillIds: string[],
  allSkills: Map<string, SkillDefinition>,
): Record<string, AgentDefinition> {
  const agents: Record<string, AgentDefinition> = {};

  for (const id of skillIds) {
    const skill = allSkills.get(id);
    if (!skill?.actions) continue;
    for (const action of skill.actions) {
      const agentKey = `${skill.id}__${action.id}`;
      agents[agentKey] = {
        description: action.description,
        prompt: action.systemPrompt,
        maxTurns: action.maxTurns ?? 5,
        tools: action.allowGovernanceTools !== false ? GOVERNANCE_TOOL_NAMES : [],
      };
    }
  }

  return agents;
}

export function migrateYamlToSkillMd(
  yamlPath: string,
  outputDir: string,
): void {
  const raw = fs.readFileSync(yamlPath, "utf-8");
  const parsed = YAML.parse(raw) as Record<string, unknown>;
  if (!parsed?.id || !parsed?.name) {
    throw new Error(`Invalid skill YAML: missing required fields (id, name)`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  // Build SKILL.md
  const frontmatter: Record<string, unknown> = {
    name: parsed.id,
    description: (parsed.description as string) ?? "",
  };
  const metadata: Record<string, unknown> = {};
  if (parsed.version) metadata.version = parsed.version;
  if (parsed.personas) metadata.personas = parsed.personas;
  if (Object.keys(metadata).length > 0) frontmatter.metadata = metadata;

  // Get wildcard prompt fragment for the body
  const promptFragments = parsed.promptFragments as Record<string, string> | undefined;
  const wildcardPrompt = promptFragments?.["*"] ?? "";

  const skillMd = matter.stringify(wildcardPrompt ? `\n${wildcardPrompt}\n` : "\n", frontmatter);
  fs.writeFileSync(path.join(outputDir, "SKILL.md"), skillMd, "utf-8");

  // Write persona-specific fragments
  if (promptFragments) {
    const personaKeys = Object.keys(promptFragments).filter((k) => k !== "*");
    if (personaKeys.length > 0) {
      const personasDir = path.join(outputDir, "personas");
      fs.mkdirSync(personasDir, { recursive: true });
      for (const personaId of personaKeys) {
        fs.writeFileSync(
          path.join(personasDir, `${personaId}.md`),
          `${promptFragments[personaId]}\n`,
          "utf-8",
        );
      }
    }
  }

  // Write actions
  const actions = parsed.actions as unknown[] | undefined;
  if (actions && actions.length > 0) {
    fs.writeFileSync(
      path.join(outputDir, "actions.yaml"),
      YAML.stringify(actions),
      "utf-8",
    );
  }
}
