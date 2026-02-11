import type { PersonaDefinition } from "./types.js";
import type { MarvinProjectConfig } from "../core/config.js";

export function buildSystemPrompt(
  persona: PersonaDefinition,
  projectConfig: MarvinProjectConfig,
  pluginPromptFragment?: string,
  skillPromptFragment?: string,
): string {
  const parts: string[] = [];

  parts.push(persona.systemPrompt);

  parts.push(`
## Project Context
- **Project Name:** ${projectConfig.name}
- **Methodology:** ${projectConfig.methodology ?? "Generic Agile"}
`);

  parts.push(`
## Available Tools
You have access to governance tools for managing project artifacts:
- **Decisions** (D-xxx): List, get, create, and update decisions
- **Actions** (A-xxx): List, get, create, and update action items
- **Questions** (Q-xxx): List, get, create, and update questions
- **Features** (F-xxx): List, get, create, and update feature definitions
- **Epics** (E-xxx): List, get, create, and update implementation epics (must link to approved features)
- **Documents**: Search and read any project document
- **Sources**: List source documents and view their processing status and derived artifacts

Use these tools proactively to:
1. Record important decisions with rationale
2. Create action items with clear owners and deadlines
3. Track open questions that need answers
4. Reference existing artifacts in your responses
5. Check source documents for traceability when discussing requirements or decisions
`);

  if (pluginPromptFragment) {
    parts.push(`
## Plugin Tools
${pluginPromptFragment}
`);
  }

  if (skillPromptFragment) {
    parts.push(`\n## Skills\n${skillPromptFragment}\n`);
  }

  if (projectConfig.personas?.[persona.id]?.extraInstructions) {
    parts.push(`
## Additional Instructions
${projectConfig.personas[persona.id].extraInstructions}
`);
  }

  return parts.join("\n");
}
