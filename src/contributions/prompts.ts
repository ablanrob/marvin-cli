import type { PersonaDefinition } from "../personas/types.js";
import type { MarvinProjectConfig } from "../core/config.js";

export function buildContributeSystemPrompt(
  persona: PersonaDefinition,
  contributionType: string,
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
## Contribution Analysis Task
You are processing a **${contributionType}** contribution from the **${persona.name}**.
Review the contribution content and determine what governance effects should follow.

Possible effects include:
1. **Create** new artifacts — decisions (D-xxx), actions (A-xxx), questions (Q-xxx)
2. **Update** existing artifacts — change status, add information, close items
`);

  parts.push(buildContributionTypeInstructions(contributionType));

  if (isDraft) {
    parts.push(`
## Mode: Draft Proposal
Present your findings as a structured proposal. Do NOT create or update any artifacts.
Format your response as:

### Proposed Effects
For each effect:
- **Action:** [create/update]
- **Target:** [new artifact type or existing artifact ID]
- **Details:** [what would be created or changed]
- **Rationale:** [why this effect follows from the contribution]

### Summary
Provide a brief summary of the contribution analysis and recommendations.
`);
  } else {
    parts.push(`
## Mode: Direct Execution
Use the MCP tools to create and update artifacts directly:
- Use \`create_decision\` / \`create_action\` / \`create_question\` for new artifacts
- Use \`update_decision\` / \`update_action\` / \`update_question\` to modify existing ones
- Use \`list_decisions\` / \`list_actions\` / \`list_questions\` to check existing artifacts before creating or updating

Before creating artifacts, check existing ones using the list tools to avoid duplicates.

For EVERY artifact you create or update, include:
- A \`source:<contribution-id>\` tag in the tags array (the contribution ID is provided in the user prompt)
- Clear title and detailed content with context from the contribution

After processing all effects, provide a summary of what was created and updated.
`);
  }

  return parts.join("\n");
}

function buildContributionTypeInstructions(contributionType: string): string {
  const instructions: Record<string, string> = {
    "action-result": `
### Type-Specific Guidance: Action Result
The contributor is reporting results of a completed action.
- Update the referenced action's status to "done" if results are conclusive
- Check if the results answer any open questions — if so, update those questions
- Check if results challenge any existing decisions — if so, create a new question or update the decision
- If results reveal new work, create new actions`,

    "spike-findings": `
### Type-Specific Guidance: Spike Findings
The contributor is sharing findings from a technical investigation (spike).
- Create decisions for any architectural or technical choices made
- Update or close the original spike action if referenced
- Create new actions for follow-up implementation work
- Create questions for areas needing further investigation`,

    "technical-assessment": `
### Type-Specific Guidance: Technical Assessment
The contributor is providing a technical evaluation.
- Create decisions for technical recommendations
- Create actions for remediation or improvement tasks
- Create questions for areas needing more investigation
- Flag any risks by tagging artifacts with "risk"`,

    "architecture-review": `
### Type-Specific Guidance: Architecture Review
The contributor is documenting an architecture review.
- Create decisions for architectural choices and trade-offs
- Create actions for any architectural changes needed
- Create questions for design concerns or alternatives to evaluate
- Update existing decisions if the review validates or challenges them`,

    "stakeholder-feedback": `
### Type-Specific Guidance: Stakeholder Feedback
The contributor is relaying feedback from stakeholders.
- Create or update decisions based on stakeholder direction
- Create actions for requested changes or follow-ups
- Create questions for items needing clarification
- Update priorities on existing artifacts if feedback changes priorities`,

    "acceptance-result": `
### Type-Specific Guidance: Acceptance Result
The contributor is reporting results of acceptance testing.
- Update the referenced action/feature status based on pass/fail
- Create new actions for any rework needed
- Create questions for ambiguous acceptance criteria
- If accepted, mark related actions as "done"`,

    "priority-change": `
### Type-Specific Guidance: Priority Change
The contributor is communicating a change in priorities.
- Update priority fields on affected artifacts
- Create decisions documenting the priority change rationale
- Create actions for any re-planning needed
- Flag any blocked or impacted items`,

    "market-insight": `
### Type-Specific Guidance: Market Insight
The contributor is sharing market intelligence or competitive information.
- Create decisions if the insight drives product direction changes
- Create questions for areas needing further market research
- Create actions for competitive response tasks
- Update existing features or priorities if affected`,

    "risk-finding": `
### Type-Specific Guidance: Risk Finding
The contributor is identifying a project risk.
- Create actions for risk mitigation tasks
- Create decisions for risk response strategies
- Create questions for risks needing further assessment
- Tag all related artifacts with "risk" for tracking
- When a risk is resolved, use the update tool to remove the "risk" tag and add "risk-mitigated" so it no longer inflates the GAR quality metric`,

    "blocker-report": `
### Type-Specific Guidance: Blocker Report
The contributor is reporting a blocker.
- Create actions to resolve the blocker
- Update blocked artifacts' status or add blocking context
- Create questions for blockers needing external input
- Escalate by creating high-priority actions if critical`,

    "dependency-update": `
### Type-Specific Guidance: Dependency Update
The contributor is reporting on external or internal dependencies.
- Update affected actions with dependency information
- Create new actions for dependency-related tasks
- Create questions for uncertain dependencies
- Update timelines or flag schedule risks`,

    "status-assessment": `
### Type-Specific Guidance: Status Assessment
The contributor is providing a delivery status assessment.
- Update action statuses based on assessment
- Create actions for corrective measures
- Create questions for items needing investigation
- Create decisions for any process changes needed`,
  };

  return (
    instructions[contributionType] ??
    `
### Type-Specific Guidance
Analyze the contribution and determine appropriate governance effects based on the content.`
  );
}

export function buildContributeUserPrompt(
  contributionId: string,
  contributionType: string,
  content: string,
  aboutArtifact: string | undefined,
  isDraft: boolean,
): string {
  const mode = isDraft ? "propose" : "execute";
  const aboutLine = aboutArtifact ? `\n**Related Artifact:** ${aboutArtifact}` : "";

  return `Please analyze the following contribution and ${mode} governance effects.

**Contribution ID:** ${contributionId}
**Contribution Type:** ${contributionType}${aboutLine}

---
${content}
---

Analyze this contribution thoroughly and ${mode} all relevant governance effects (create new artifacts, update existing ones). Tag each created or updated artifact with "source:${contributionId}" for traceability.`;
}
