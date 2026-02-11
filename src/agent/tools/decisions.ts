import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../storage/store.js";

export function createDecisionTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_decisions",
      "List all decisions in the project, optionally filtered by status",
      { status: z.string().optional().describe("Filter by status (e.g. 'open', 'decided', 'superseded')") },
      async (args) => {
        const docs = store.list({ type: "decision", status: args.status });
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          created: d.frontmatter.created,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_decision",
      "Get the full content of a specific decision by ID",
      { id: z.string().describe("Decision ID (e.g. 'D-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Decision ${args.id} not found` }],
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
      "create_decision",
      "Create a new decision record",
      {
        title: z.string().describe("Title of the decision"),
        content: z.string().describe("Decision description, context, and rationale"),
        status: z.string().optional().describe("Status (default: 'open')"),
        owner: z.string().optional().describe("Person responsible for this decision"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
      },
      async (args) => {
        const doc = store.create(
          "decision",
          {
            title: args.title,
            status: args.status,
            owner: args.owner,
            tags: args.tags,
          },
          args.content,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Created decision ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),

    tool(
      "update_decision",
      "Update an existing decision",
      {
        id: z.string().describe("Decision ID to update"),
        title: z.string().optional().describe("New title"),
        status: z.string().optional().describe("New status"),
        content: z.string().optional().describe("New content"),
        owner: z.string().optional().describe("New owner"),
      },
      async (args) => {
        const { id, content, ...updates } = args;
        const doc = store.update(id, updates, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated decision ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),
  ];
}
