import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../storage/store.js";

export function createQuestionTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_questions",
      "List all questions in the project, optionally filtered by status",
      {
        status: z.string().optional().describe("Filter by status (e.g. 'open', 'answered', 'deferred')"),
      },
      async (args) => {
        const docs = store.list({ type: "question", status: args.status });
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          owner: d.frontmatter.owner,
          created: d.frontmatter.created,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_question",
      "Get the full content of a specific question by ID",
      { id: z.string().describe("Question ID (e.g. 'Q-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Question ${args.id} not found` }],
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
      "create_question",
      "Create a new question that needs to be answered",
      {
        title: z.string().describe("The question being asked"),
        content: z.string().describe("Context and details about the question"),
        status: z.string().optional().describe("Status (default: 'open')"),
        owner: z.string().optional().describe("Person who should answer this"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
      },
      async (args) => {
        const doc = store.create(
          "question",
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
              text: `Created question ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),

    tool(
      "update_question",
      "Update an existing question",
      {
        id: z.string().describe("Question ID to update"),
        title: z.string().optional().describe("New title"),
        status: z.string().optional().describe("New status (e.g. 'answered')"),
        content: z.string().optional().describe("Updated content / answer"),
        owner: z.string().optional().describe("New owner"),
      },
      async (args) => {
        const { id, content, ...updates } = args;
        const doc = store.update(id, updates, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated question ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),
  ];
}
