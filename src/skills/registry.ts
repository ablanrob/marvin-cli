import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";
import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../storage/store.js";
import type { SkillDefinition, SkillInfo } from "./types.js";
import { governanceReviewSkill } from "./builtin/governance-review.js";

const BUILTIN_SKILLS: Record<string, SkillDefinition> = {
  "governance-review": governanceReviewSkill,
};

export function loadAllSkills(marvinDir?: string): Map<string, SkillDefinition> {
  const skills = new Map<string, SkillDefinition>();

  for (const [id, skill] of Object.entries(BUILTIN_SKILLS)) {
    skills.set(id, skill);
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
      for (const file of entries) {
        if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
        try {
          const raw = fs.readFileSync(path.join(skillsDir, file), "utf-8");
          const parsed = YAML.parse(raw) as Record<string, unknown>;
          if (!parsed?.id || !parsed?.name || !parsed?.version) continue;
          const skill: SkillDefinition = {
            id: parsed.id as string,
            name: parsed.name as string,
            description: (parsed.description as string) ?? "",
            version: parsed.version as string,
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
      assignedPersonas,
    });
  }
  return result;
}
