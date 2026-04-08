import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as YAML from "yaml";
import matter from "gray-matter";
import { z } from "zod/v4";
import type { AgentDefinition, SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../storage/store.js";
import type { DocumentTypeRegistration } from "../storage/types.js";
import type { MarvinProjectConfig } from "../core/config.js";
import type { SkillDefinition, SkillInfo } from "./types.js";
import { governanceReviewSkill } from "./builtin/governance-review.js";
import { jiraSkill } from "./builtin/jira/index.js";
import { prdGeneratorSkill } from "./builtin/prd-generator/index.js";

const BUILTIN_SKILLS: Record<string, SkillDefinition> = {
  "governance-review": governanceReviewSkill,
  jira: jiraSkill,
  "prd-generator": prdGeneratorSkill,
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

/** Schema for validating legacy YAML skill definitions. */
const YAML_SKILL_SCHEMA = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  version: z.string(),
  personas: z.array(z.string()).optional(),
  promptFragments: z.record(z.string(), z.string()).optional(),
  actions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        systemPrompt: z.string(),
        maxTurns: z.number().optional(),
        allowGovernanceTools: z.boolean().optional(),
      }),
    )
    .optional(),
});

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

    if (typeof data.name !== "string" || typeof data.description !== "string") return undefined;

    const metadata =
      data.metadata !== null && data.metadata !== undefined && typeof data.metadata === "object"
        ? (data.metadata as Record<string, unknown>)
        : {};
    const version = typeof metadata.version === "string" ? metadata.version : "1.0.0";
    const personas = Array.isArray(metadata.personas)
      ? (metadata.personas as unknown[]).filter((p): p is string => typeof p === "string")
      : undefined;

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
      } catch (e) {
        console.warn(`[marvin] Failed to read personas directory in ${dirPath}:`, e);
      }
    }

    // Load actions
    let actions: SkillDefinition["actions"];
    const actionsPath = path.join(dirPath, "actions.yaml");
    if (fs.existsSync(actionsPath)) {
      try {
        const actionsRaw = fs.readFileSync(actionsPath, "utf-8");
        actions = YAML.parse(actionsRaw) as SkillDefinition["actions"];
      } catch (e) {
        console.warn(`[marvin] Failed to parse actions.yaml in ${dirPath}:`, e);
      }
    }

    return {
      id: data.name,
      name: data.name.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      description: data.description,
      version,
      format: "skill-md",
      dirPath,
      personas,
      promptFragments: Object.keys(promptFragments).length > 0 ? promptFragments : undefined,
      actions,
    };
  } catch (e) {
    console.warn(`[marvin] Failed to load skill from ${dirPath}:`, e);
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
  } catch (e) {
    console.warn(`[marvin] Failed to load builtin skills directory:`, e);
  }

  if (marvinDir) {
    const skillsDir = path.join(marvinDir, "skills");
    if (fs.existsSync(skillsDir)) {
      let entries: string[];
      try {
        entries = fs.readdirSync(skillsDir);
      } catch (e) {
        console.warn(`[marvin] Failed to read skills directory in ${marvinDir}:`, e);
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
        } catch (e) {
          console.warn(`[marvin] Failed to stat skill entry ${entryPath}:`, e);
          continue;
        }

        // Legacy YAML files
        if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;
        try {
          const raw = fs.readFileSync(entryPath, "utf-8");
          const parsed = YAML_SKILL_SCHEMA.parse(YAML.parse(raw));
          const skill: SkillDefinition = {
            id: parsed.id,
            name: parsed.name,
            description: parsed.description,
            version: parsed.version,
            format: "yaml",
            personas: parsed.personas,
            promptFragments: parsed.promptFragments,
            actions: parsed.actions,
          };
          skills.set(skill.id, skill);
        } catch (e) {
          console.warn(`[marvin] Failed to parse skill YAML ${entryPath}:`, e);
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

export function collectSkillRegistrations(
  skillIds: string[],
  allSkills: Map<string, SkillDefinition>,
): DocumentTypeRegistration[] {
  const registrations: DocumentTypeRegistration[] = [];
  for (const id of skillIds) {
    const skill = allSkills.get(id);
    if (skill?.documentTypeRegistrations) {
      registrations.push(...skill.documentTypeRegistrations);
    }
  }
  return registrations;
}

export function getSkillTools(
  skillIds: string[],
  allSkills: Map<string, SkillDefinition>,
  store: DocumentStore,
  projectConfig?: MarvinProjectConfig,
): SdkMcpToolDefinition<any>[] {
  const tools: SdkMcpToolDefinition<any>[] = [];
  for (const id of skillIds) {
    const skill = allSkills.get(id);
    if (skill?.tools) {
      tools.push(...skill.tools(store, projectConfig));
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
    const fragment = skill.promptFragments[personaId] ?? skill.promptFragments["*"];
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

export function migrateYamlToSkillMd(yamlPath: string, outputDir: string): void {
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
    fs.writeFileSync(path.join(outputDir, "actions.yaml"), YAML.stringify(actions), "utf-8");
  }
}
