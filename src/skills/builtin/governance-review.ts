import type { SkillDefinition } from "../types.js";

export const governanceReviewSkill: SkillDefinition = {
  id: "governance-review",
  name: "Governance Review",
  description: "Review open governance items and generate summaries",
  version: "1.0.0",
  personas: ["delivery-manager", "product-owner"],
  promptFragments: {
    "delivery-manager": `You have the **Governance Review** skill. You can proactively review all open governance items (decisions, actions, questions) and produce structured summaries with recommendations. Use the \`governance-review__summarize\` tool to run a comprehensive review.`,
    "product-owner": `You have the **Governance Review** skill. You can review all open governance items (decisions, actions, questions) and produce structured summaries focused on product impact and priorities. Use the \`governance-review__summarize\` tool to run a comprehensive review.`,
  },
  actions: [
    {
      id: "summarize",
      name: "Summarize Open Governance Items",
      description:
        "Review all open decisions, actions, questions and produce a summary with recommendations",
      systemPrompt: `You are a governance review assistant. Your task is to:

1. Use the governance tools to list all open decisions, actions, and questions
2. Analyze each category for:
   - Total count and age of items
   - Items without owners
   - High-priority items needing attention
   - Items that may be stale or blocked
3. Produce a structured summary with:
   - Overview statistics
   - Priority items needing immediate attention
   - Recommendations for next steps
   - Risk areas (unowned items, overdue items, blocked items)

Be thorough but concise. Focus on actionable insights.`,
      maxTurns: 10,
    },
  ],
};
