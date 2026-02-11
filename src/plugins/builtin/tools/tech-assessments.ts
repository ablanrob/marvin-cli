import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";

export function createTechAssessmentTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_tech_assessments",
      "List all technology assessments, optionally filtered by status",
      {
        status: z
          .enum(["draft", "evaluated", "recommended", "rejected"])
          .optional()
          .describe("Filter by assessment status"),
        linkedUseCase: z
          .string()
          .optional()
          .describe("Filter by linked use case ID (e.g. 'UC-001')"),
      },
      async (args) => {
        let docs = store.list({ type: "tech-assessment", status: args.status });
        if (args.linkedUseCase) {
          docs = docs.filter(
            (d) => d.frontmatter.linkedUseCase === args.linkedUseCase,
          );
        }
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          linkedUseCase: d.frontmatter.linkedUseCase,
          btpServices: d.frontmatter.btpServices,
          extensionPoint: d.frontmatter.extensionPoint,
          recommendation: d.frontmatter.recommendation,
          owner: d.frontmatter.owner,
          tags: d.frontmatter.tags,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_tech_assessment",
      "Get the full content of a specific technology assessment by ID",
      { id: z.string().describe("Tech assessment ID (e.g. 'TA-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Tech assessment ${args.id} not found` }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { ...doc.frontmatter, content: doc.content },
                null,
                2,
              ),
            },
          ],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "create_tech_assessment",
      "Create a new technology assessment linked to an assessed/approved use case (Phase 2: Assess Extension Technology)",
      {
        title: z.string().describe("Assessment title"),
        content: z.string().describe("Technology evaluation — BTP services analysis, extension point mapping, feasibility"),
        linkedUseCase: z.string().describe("Use case ID to link this assessment to (e.g. 'UC-001')"),
        status: z
          .enum(["draft", "evaluated", "recommended", "rejected"])
          .optional()
          .describe("Assessment status (default: 'draft')"),
        btpServices: z
          .array(z.string())
          .optional()
          .describe("BTP services evaluated (e.g. ['SAP Build Work Zone', 'SAP Event Mesh'])"),
        extensionPoint: z
          .string()
          .optional()
          .describe("SAP extension point being evaluated"),
        recommendation: z
          .string()
          .optional()
          .describe("Technology recommendation summary"),
        owner: z.string().optional().describe("Assessment owner"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
      },
      async (args) => {
        // Validate linked use case exists and is assessed or approved
        const useCase = store.get(args.linkedUseCase);
        if (!useCase) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Use case ${args.linkedUseCase} not found`,
              },
            ],
            isError: true,
          };
        }
        if (useCase.frontmatter.type !== "use-case") {
          return {
            content: [
              {
                type: "text" as const,
                text: `${args.linkedUseCase} is a ${useCase.frontmatter.type}, not a use-case`,
              },
            ],
            isError: true,
          };
        }
        const validStatuses = ["assessed", "approved"];
        if (!validStatuses.includes(useCase.frontmatter.status)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Use case ${args.linkedUseCase} has status '${useCase.frontmatter.status}'. Only assessed or approved use cases can have tech assessments. Assess it first.`,
              },
            ],
            isError: true,
          };
        }

        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: args.status ?? "draft",
          linkedUseCase: args.linkedUseCase,
          tags: [`use-case:${args.linkedUseCase}`, ...(args.tags ?? [])],
        };
        if (args.btpServices) frontmatter.btpServices = args.btpServices;
        if (args.extensionPoint) frontmatter.extensionPoint = args.extensionPoint;
        if (args.recommendation) frontmatter.recommendation = args.recommendation;
        if (args.owner) frontmatter.owner = args.owner;

        const doc = store.create("tech-assessment", frontmatter as any, args.content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Created tech assessment ${doc.frontmatter.id}: ${doc.frontmatter.title} (linked to ${args.linkedUseCase})`,
            },
          ],
        };
      },
    ),

    tool(
      "update_tech_assessment",
      "Update an existing technology assessment. The linked use case cannot be changed.",
      {
        id: z.string().describe("Tech assessment ID to update"),
        title: z.string().optional().describe("New title"),
        status: z
          .enum(["draft", "evaluated", "recommended", "rejected"])
          .optional()
          .describe("New status"),
        content: z.string().optional().describe("New content"),
        btpServices: z
          .array(z.string())
          .optional()
          .describe("Updated BTP services list"),
        extensionPoint: z.string().optional().describe("Updated extension point"),
        recommendation: z.string().optional().describe("Updated recommendation"),
        owner: z.string().optional().describe("New owner"),
      },
      async (args) => {
        const { id, content, ...updates } = args;
        const doc = store.update(id, updates, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated tech assessment ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),
  ];
}
