import type { PersonaDefinition } from "../personas/types.js";
import { getPersona, listPersonas } from "../personas/registry.js";
import { loadProjectConfig } from "../core/config.js";
import { resolvePlugin, getPluginPromptFragment } from "../plugins/registry.js";
import {
  loadAllSkills,
  resolveSkillsForPersona,
  getSkillPromptFragment,
} from "../skills/registry.js";

/**
 * Manages the active persona state for the standalone MCP server.
 */
export class PersonaContextManager {
  private activePersona: PersonaDefinition | null = null;

  setPersona(idOrShortName: string): PersonaDefinition | undefined {
    const persona = getPersona(idOrShortName);
    if (persona) {
      this.activePersona = persona;
    }
    return persona;
  }

  getActivePersona(): PersonaDefinition | null {
    return this.activePersona;
  }

  clearPersona(): void {
    this.activePersona = null;
  }

  isDocumentTypeAllowed(docType: string): boolean {
    if (!this.activePersona) return true;
    return this.activePersona.documentTypes.includes(docType);
  }
}

/**
 * Build a guidance string for an MCP client describing the persona's role,
 * allowed document types, behavioral rules, and any plugin/skill-specific instructions.
 */
export function buildMcpGuidance(persona: PersonaDefinition, marvinDir: string): string {
  const parts: string[] = [];

  parts.push(`# Active Persona: ${persona.name} (${persona.shortName})`);
  parts.push(`\n${persona.description}`);

  parts.push(`\n## Focus Areas`);
  for (const area of persona.focusAreas) {
    parts.push(`- ${area}`);
  }

  parts.push(`\n## Allowed Document Types`);
  parts.push(persona.documentTypes.join(", "));

  parts.push(`\n## Behavioral Instructions`);
  parts.push(persona.systemPrompt);

  // Plugin-specific rules
  try {
    const config = loadProjectConfig(marvinDir);
    const plugin = resolvePlugin(config.methodology);
    if (plugin) {
      const fragment = getPluginPromptFragment(plugin, persona.id);
      if (fragment) {
        parts.push(`\n## Plugin Rules`);
        parts.push(fragment);
      }
    }

    // Skill-specific rules
    const allSkills = loadAllSkills(marvinDir);
    const skillIds = resolveSkillsForPersona(persona.id, config.skills, allSkills);
    if (skillIds.length > 0) {
      const fragment = getSkillPromptFragment(skillIds, allSkills, persona.id);
      if (fragment) {
        parts.push(`\n## Skill Rules`);
        parts.push(fragment);
      }
    }
  } catch {
    // Config or plugin loading may fail — guidance still useful without extras
  }

  return parts.join("\n");
}

/**
 * Build a short summary string for listing all available personas.
 */
export function buildPersonaSummaries(): string {
  const personas = listPersonas();
  const lines = personas.map(
    (p) =>
      `- **${p.name}** (${p.shortName}): ${p.description}\n  Document types: ${p.documentTypes.join(", ")}`,
  );
  return `# Available Personas\n\n${lines.join("\n\n")}`;
}
