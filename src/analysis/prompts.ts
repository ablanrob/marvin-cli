import type { PersonaDefinition } from "../personas/types.js";
import type { MarvinProjectConfig } from "../core/config.js";

export function buildAnalyzeSystemPrompt(
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
## Meeting Analysis Task
You are analyzing a meeting record to extract governance artifacts for the project.
Review the meeting content thoroughly and identify:

1. **Decisions** (D-xxx): Any decisions made during the meeting — architectural choices, process agreements, technology selections, or resolved discussion points.
2. **Actions** (A-xxx): Tasks assigned, follow-ups agreed upon, work items to be done, or commitments made during the meeting.
3. **Questions** (Q-xxx): Open questions raised, unresolved discussion points, items needing further investigation, or clarifications needed.

For each artifact, provide:
- A clear, concise title
- Detailed content with rationale or context from the meeting discussion
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
- **Content:** [description and rationale from the meeting]
- **Tags:** [comma-separated tags]

### Proposed Actions
For each action:
- **Title:** [title]
- **Assignee:** [who was assigned, if mentioned]
- **Content:** [what needs to be done]
- **Tags:** [comma-separated tags]

### Proposed Questions
For each question:
- **Title:** [title]
- **Content:** [what needs clarification and why]
- **Tags:** [comma-separated tags]

### Summary
Provide a brief summary of the meeting outcomes and any recommendations.
`);
  } else {
    parts.push(`
## Mode: Direct Creation
Use the MCP tools to create artifacts directly:
- Use \`create_decision\` for decisions
- Use \`create_action\` for action items
- Use \`create_question\` for questions

Before creating artifacts, check existing ones using the list tools to avoid duplicates.

For EVERY artifact you create, include:
- A \`source:<meeting-id>\` tag in the tags array (the meeting ID is provided in the user prompt)
- Clear title and detailed content with context from the meeting

After creating all artifacts, provide a summary of what was created.
`);
  }

  return parts.join("\n");
}

export function buildAnalyzeUserPrompt(
  meetingId: string,
  meetingContent: string,
  meetingTitle: string,
  isDraft: boolean,
): string {
  const mode = isDraft ? "propose" : "create";

  return `Please analyze the following meeting record and ${mode} governance artifacts (decisions, actions, questions) based on its content.

**Meeting ID:** ${meetingId}
**Meeting Title:** ${meetingTitle}

---
${meetingContent}
---

Analyze this meeting thoroughly and ${mode} all relevant governance artifacts. Tag each artifact with "source:${meetingId}" for traceability back to this meeting.`;
}
