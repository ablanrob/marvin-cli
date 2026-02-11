import type { PersonaDefinition } from "../personas/types.js";
import type { MarvinProjectConfig } from "../core/config.js";

export function buildIngestSystemPrompt(
  persona: PersonaDefinition,
  projectConfig: MarvinProjectConfig,
  isDraft: boolean,
): string {
  const parts: string[] = [];

  parts.push(persona.systemPrompt);

  parts.push(`
## Project Context
- **Project Name:** ${projectConfig.name}
- **Methodology:** ${projectConfig.methodology ?? "Generic Agile"}
`);

  parts.push(`
## Source Document Analysis Task
You are analyzing a source document to extract governance artifacts for the project.
Review the document thoroughly and identify:

1. **Decisions** (D-xxx): Architectural choices, technology selections, design patterns, or any resolved decision points found in the document.
2. **Actions** (A-xxx): Tasks, to-dos, implementation items, or work that needs to be done based on the document content.
3. **Questions** (Q-xxx): Ambiguities, open points, missing information, or items that need clarification.

For each artifact, provide:
- A clear, concise title
- Detailed content with rationale or context
- Appropriate status (decisions: "decided" or "open"; actions: "open"; questions: "open")
- Relevant tags for categorization
`);

  if (isDraft) {
    parts.push(`
## Mode: Draft Proposal
Present your findings as a structured proposal. Do NOT create any artifacts.
Format your response as:

### Proposed Decisions
For each decision:
- **Title:** [title]
- **Status:** [decided/open]
- **Content:** [description and rationale]
- **Tags:** [comma-separated tags]

### Proposed Actions
For each action:
- **Title:** [title]
- **Content:** [what needs to be done]
- **Tags:** [comma-separated tags]

### Proposed Questions
For each question:
- **Title:** [title]
- **Content:** [what needs clarification and why]
- **Tags:** [comma-separated tags]

### Summary
Provide a brief summary of what was found and any recommendations.
`);
  } else {
    parts.push(`
## Mode: Direct Creation
Use the MCP tools to create artifacts directly:
- Use \`create_decision\` for decisions
- Use \`create_action\` for action items
- Use \`create_question\` for questions

For EVERY artifact you create, include:
- A \`source\` tag in the format \`source:<filename>\` in the tags array
- Clear title and detailed content

After creating all artifacts, provide a summary of what was created.
`);
  }

  return parts.join("\n");
}

export function buildIngestUserPrompt(
  fileName: string,
  filePath: string,
  fileContent: string | null,
  isDraft: boolean,
): string {
  const mode = isDraft ? "propose" : "create";

  if (fileContent !== null) {
    return `Please analyze the following source document and ${mode} governance artifacts (decisions, actions, questions) based on its content.

**Source file:** ${fileName}

---
${fileContent}
---

Analyze this document thoroughly and ${mode} all relevant governance artifacts. Include the source file name "${fileName}" for traceability.`;
  }

  // PDF: instruct Claude to read the file using the Read tool
  return `Please analyze the source document at the following path and ${mode} governance artifacts (decisions, actions, questions) based on its content.

**Source file:** ${fileName}
**File path:** ${filePath}

This is a PDF file. Use the Read tool to read the file at the path above, then analyze its content and ${mode} all relevant governance artifacts. Include the source file name "${fileName}" for traceability.`;
}
