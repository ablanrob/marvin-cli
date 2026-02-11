import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../storage/store.js";

export function createActionTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_actions",
      "List all action items in the project, optionally filtered by status or owner",
      {
        status: z.string().optional().describe("Filter by status (e.g. 'open', 'in-progress', 'done')"),
        owner: z.string().optional().describe("Filter by owner"),
      },
      async (args) => {
        const docs = store.list({
          type: "action",
          status: args.status,
          owner: args.owner,
        });
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          owner: d.frontmatter.owner,
          priority: d.frontmatter.priority,
          created: d.frontmatter.created,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_action",
      "Get the full content of a specific action item by ID",
      { id: z.string().describe("Action ID (e.g. 'A-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Action ${args.id} not found` }],
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
      "create_action",
      "Create a new action item",
      {
        title: z.string().describe("Title of the action item"),
        content: z.string().describe("Description of what needs to be done"),
        status: z.string().optional().describe("Status (default: 'open')"),
        owner: z.string().optional().describe("Person responsible"),
        priority: z.string().optional().describe("Priority (high, medium, low)"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
      },
      async (args) => {
        const doc = store.create(
          "action",
          {
            title: args.title,
            status: args.status,
            owner: args.owner,
            priority: args.priority,
            tags: args.tags,
          },
          args.content,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Created action ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),

    tool(
      "update_action",
      "Update an existing action item",
      {
        id: z.string().describe("Action ID to update"),
        title: z.string().optional().describe("New title"),
        status: z.string().optional().describe("New status"),
        content: z.string().optional().describe("New content"),
        owner: z.string().optional().describe("New owner"),
        priority: z.string().optional().describe("New priority"),
      },
      async (args) => {
        const { id, content, ...updates } = args;
        const doc = store.update(id, updates, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated action ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),
  ];
}
