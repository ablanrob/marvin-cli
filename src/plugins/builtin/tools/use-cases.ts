import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";

export function createUseCaseTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_use_cases",
      "List all extension use cases, optionally filtered by status or extension type",
      {
        status: z
          .enum(["draft", "assessed", "approved", "deferred"])
          .optional()
          .describe("Filter by use case status"),
        extensionType: z
          .enum(["in-app", "side-by-side", "hybrid"])
          .optional()
          .describe("Filter by extension type"),
      },
      async (args) => {
        let docs = store.list({ type: "use-case", status: args.status });
        if (args.extensionType) {
          docs = docs.filter(
            (d) => d.frontmatter.extensionType === args.extensionType,
          );
        }
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          extensionType: d.frontmatter.extensionType,
          businessProcess: d.frontmatter.businessProcess,
          priority: d.frontmatter.priority,
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
      "get_use_case",
      "Get the full content of a specific use case by ID",
      { id: z.string().describe("Use case ID (e.g. 'UC-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Use case ${args.id} not found` }],
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
      "create_use_case",
      "Create a new extension use case definition (Phase 1: Assess Extension Use Case)",
      {
        title: z.string().describe("Use case title"),
        content: z.string().describe("Use case description — business scenario, justification, and expected outcome"),
        status: z
          .enum(["draft", "assessed", "approved", "deferred"])
          .optional()
          .describe("Use case status (default: 'draft')"),
        businessProcess: z
          .string()
          .optional()
          .describe("SAP business process being extended (e.g. 'Order-to-Cash', 'Procure-to-Pay')"),
        extensionType: z
          .enum(["in-app", "side-by-side", "hybrid"])
          .optional()
          .describe("Extension type classification"),
        priority: z
          .enum(["critical", "high", "medium", "low"])
          .optional()
          .describe("Business priority"),
        owner: z.string().optional().describe("Use case owner"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
      },
      async (args) => {
        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: args.status ?? "draft",
        };
        if (args.businessProcess) frontmatter.businessProcess = args.businessProcess;
        if (args.extensionType) frontmatter.extensionType = args.extensionType;
        if (args.priority) frontmatter.priority = args.priority;
        if (args.owner) frontmatter.owner = args.owner;
        if (args.tags) frontmatter.tags = args.tags;

        const doc = store.create("use-case", frontmatter as any, args.content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Created use case ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),

    tool(
      "update_use_case",
      "Update an existing extension use case",
      {
        id: z.string().describe("Use case ID to update"),
        title: z.string().optional().describe("New title"),
        status: z
          .enum(["draft", "assessed", "approved", "deferred"])
          .optional()
          .describe("New status"),
        content: z.string().optional().describe("New content"),
        businessProcess: z.string().optional().describe("New business process"),
        extensionType: z
          .enum(["in-app", "side-by-side", "hybrid"])
          .optional()
          .describe("New extension type"),
        priority: z
          .enum(["critical", "high", "medium", "low"])
          .optional()
          .describe("New priority"),
        owner: z.string().optional().describe("New owner"),
      },
      async (args) => {
        const { id, content, ...updates } = args;
        const doc = store.update(id, updates, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated use case ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),
  ];
}
