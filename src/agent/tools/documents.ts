import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../storage/store.js";

export function createDocumentTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "search_documents",
      "Search all project documents, optionally filtered by type, status, or tag",
      {
        type: z
          .string()
          .optional()
          .describe(`Filter by document type (registered types: ${store.registeredTypes.join(", ")})`),
        status: z.string().optional().describe("Filter by status"),
        tag: z.string().optional().describe("Filter by tag"),
      },
      async (args) => {
        const docs = store.list({
          type: args.type,
          status: args.status,
          tag: args.tag,
        });
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          type: d.frontmatter.type,
          status: d.frontmatter.status,
          created: d.frontmatter.created,
        }));
        return {
          content: [
            {
              type: "text" as const,
              text:
                summary.length > 0
                  ? JSON.stringify(summary, null, 2)
                  : "No documents found matching the criteria.",
            },
          ],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "read_document",
      "Read the full content of any project document by ID",
      { id: z.string().describe("Document ID (e.g. 'D-001', 'A-003', 'Q-002')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Document ${args.id} not found` }],
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
      "project_summary",
      "Get a summary of all project documents and their counts",
      {},
      async () => {
        const counts = store.counts();
        const openActions = store.list({ type: "action", status: "open" });
        const openQuestions = store.list({ type: "question", status: "open" });
        const openDecisions = store.list({ type: "decision", status: "open" });

        const summary = {
          totals: counts,
          open: {
            decisions: openDecisions.length,
            actions: openActions.length,
            questions: openQuestions.length,
          },
          recentActions: openActions.slice(0, 5).map((d) => ({
            id: d.frontmatter.id,
            title: d.frontmatter.title,
            owner: d.frontmatter.owner,
          })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),
  ];
}
