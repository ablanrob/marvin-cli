import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";

export function createExtensionDesignTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_extension_designs",
      "List all extension designs, optionally filtered by status",
      {
        status: z
          .enum(["draft", "designed", "validated", "approved"])
          .optional()
          .describe("Filter by design status"),
        linkedTechAssessment: z
          .string()
          .optional()
          .describe("Filter by linked tech assessment ID (e.g. 'TA-001')"),
      },
      async (args) => {
        let docs = store.list({ type: "extension-design", status: args.status });
        if (args.linkedTechAssessment) {
          docs = docs.filter(
            (d) => d.frontmatter.linkedTechAssessment === args.linkedTechAssessment,
          );
        }
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          linkedTechAssessment: d.frontmatter.linkedTechAssessment,
          architecture: d.frontmatter.architecture,
          btpServices: d.frontmatter.btpServices,
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
      "get_extension_design",
      "Get the full content of a specific extension design by ID",
      { id: z.string().describe("Extension design ID (e.g. 'XD-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Extension design ${args.id} not found` }],
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
      "create_extension_design",
      "Create a new extension design linked to a recommended tech assessment (Phase 3: Define Extension Target Solution)",
      {
        title: z.string().describe("Extension design title"),
        content: z.string().describe("Architecture description — components, integration points, data flow, deployment model"),
        linkedTechAssessment: z.string().describe("Tech assessment ID to link this design to (e.g. 'TA-001')"),
        status: z
          .enum(["draft", "designed", "validated", "approved"])
          .optional()
          .describe("Design status (default: 'draft')"),
        architecture: z
          .string()
          .optional()
          .describe("Architecture pattern (e.g. 'event-driven', 'API-based', 'UI-extension')"),
        btpServices: z
          .array(z.string())
          .optional()
          .describe("BTP services used in the design"),
        owner: z.string().optional().describe("Design owner"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
      },
      async (args) => {
        // Validate linked tech assessment exists and is recommended
        const ta = store.get(args.linkedTechAssessment);
        if (!ta) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Tech assessment ${args.linkedTechAssessment} not found`,
              },
            ],
            isError: true,
          };
        }
        if (ta.frontmatter.type !== "tech-assessment") {
          return {
            content: [
              {
                type: "text" as const,
                text: `${args.linkedTechAssessment} is a ${ta.frontmatter.type}, not a tech-assessment`,
              },
            ],
            isError: true,
          };
        }
        if (ta.frontmatter.status !== "recommended") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Tech assessment ${args.linkedTechAssessment} has status '${ta.frontmatter.status}'. Only recommended tech assessments can have extension designs. Recommend it first.`,
              },
            ],
            isError: true,
          };
        }

        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: args.status ?? "draft",
          linkedTechAssessment: args.linkedTechAssessment,
          tags: [`tech-assessment:${args.linkedTechAssessment}`, ...(args.tags ?? [])],
        };
        if (args.architecture) frontmatter.architecture = args.architecture;
        if (args.btpServices) frontmatter.btpServices = args.btpServices;
        if (args.owner) frontmatter.owner = args.owner;

        const doc = store.create("extension-design", frontmatter as any, args.content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Created extension design ${doc.frontmatter.id}: ${doc.frontmatter.title} (linked to ${args.linkedTechAssessment})`,
            },
          ],
        };
      },
    ),

    tool(
      "update_extension_design",
      "Update an existing extension design. The linked tech assessment cannot be changed.",
      {
        id: z.string().describe("Extension design ID to update"),
        title: z.string().optional().describe("New title"),
        status: z
          .enum(["draft", "designed", "validated", "approved"])
          .optional()
          .describe("New status"),
        content: z.string().optional().describe("New content"),
        architecture: z.string().optional().describe("Updated architecture pattern"),
        btpServices: z
          .array(z.string())
          .optional()
          .describe("Updated BTP services list"),
        owner: z.string().optional().describe("New owner"),
      },
      async (args) => {
        const { id, content, ...updates } = args;
        const doc = store.update(id, updates, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated extension design ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),
  ];
}
