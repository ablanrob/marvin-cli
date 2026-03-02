import type { SkillDefinition } from "../../types.js";
import { createPrdTools } from "./tools.js";

export const prdGeneratorSkill: SkillDefinition = {
  id: "prd-generator",
  name: "PRD Generator",
  description: "Generate PRDs from governance artifacts for TaskMaster or Claude Code",
  version: "1.0.0",
  format: "builtin-ts",
  documentTypeRegistrations: [
    { type: "prd", dirName: "prds", idPrefix: "PRD" },
  ],
  tools: (store) => createPrdTools(store),
  promptFragments: {
    "tech-lead": `You have the **PRD Generator** skill. You can generate Product Requirements Documents from governance artifacts.

**Available tools:**
- \`gather_prd_context\` — aggregate features, epics, tasks, decisions, questions, and actions into structured JSON for analysis
- \`generate_prd\` — generate a formatted PRD document and save it as PRD-xxx. Supports "taskmaster" format (for Claude TaskMaster parse_prd) and "claude-code" format (for Claude Code consumption)
- \`export_prd\` — export a PRD document to a file path for external use

**As Tech Lead, use PRD generation to:**
- Create comprehensive PRDs that capture the full governance context
- Export TaskMaster-format PRDs for automated task breakdown via \`parse_prd\`
- Export Claude Code-format PRDs as implementation plans with checklists
- Focus PRDs on specific features using the focusFeature parameter`,

    "delivery-manager": `You have the **PRD Generator** skill. You can generate Product Requirements Documents from governance artifacts.

**Available tools:**
- \`gather_prd_context\` — aggregate all governance artifacts into structured JSON for review
- \`generate_prd\` — generate a formatted PRD document (taskmaster or claude-code format)
- \`export_prd\` — export a PRD to a file path

**As Delivery Manager, use PRD generation to:**
- Generate PRDs for stakeholder communication and project documentation
- Review aggregated project context before sprint planning
- Export PRDs to share with external teams or tools`,

    "product-owner": `You have the **PRD Generator** skill. You can generate Product Requirements Documents from governance artifacts.

**Available tools:**
- \`gather_prd_context\` — aggregate features, epics, tasks, and decisions into structured JSON
- \`generate_prd\` — generate a formatted PRD document
- \`export_prd\` — export a PRD to a file path

**As Product Owner, use PRD generation to:**
- Generate PRDs that capture feature requirements and priorities
- Review the complete governance context for product planning
- Export PRDs for stakeholder review and sign-off`,
  },
};
