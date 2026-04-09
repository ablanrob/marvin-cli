import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";
import { ownerSchema, normalizeOwner } from "../../../personas/owner.js";
import { FEATURE_STATUSES } from "../../../core/statuses.js";

export function createFeatureTools(store: DocumentStore): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_features",
      "List all features in the project, optionally filtered by status",
      {
        status: z
          .enum(["draft", "approved", "deferred", "done"])
          .optional()
          .describe("Filter by feature status"),
      },
      async (args) => {
        const docs = store.list({ type: "feature", status: args.status });
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          owner: d.frontmatter.owner,
          priority: d.frontmatter.priority,
          tags: d.frontmatter.tags,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "get_feature",
      "Get the full content of a specific feature by ID",
      { id: z.string().describe("Feature ID (e.g. 'F-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Feature ${args.id} not found` }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ...doc.frontmatter, content: doc.content }, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "create_feature",
      "Create a new feature definition",
      {
        title: z.string().describe("Feature title"),
        content: z.string().describe("Feature description and requirements"),
        status: z
          .enum(["draft", "approved", "deferred", "done"])
          .optional()
          .describe("Feature status (default: 'draft')"),
        owner: ownerSchema.optional().describe("Persona role responsible (po, dm, tl)"),
        assignee: z.string().optional().describe("Person assigned to do the work"),
        priority: z
          .enum(["critical", "high", "medium", "low"])
          .optional()
          .describe("Feature priority"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
      },
      async (args) => {
        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: args.status ?? "draft",
        };
        if (args.owner) frontmatter.owner = normalizeOwner(args.owner);
        if (args.assignee) frontmatter.assignee = args.assignee;
        if (args.priority) frontmatter.priority = args.priority;
        if (args.tags) frontmatter.tags = args.tags;

        const doc = store.create("feature", frontmatter as any, args.content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Created feature ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),

    tool(
      "update_feature",
      "Update an existing feature",
      {
        id: z.string().describe("Feature ID to update"),
        title: z.string().optional().describe("New title"),
        status: z.enum(FEATURE_STATUSES).optional().describe("New status"),
        content: z.string().optional().describe("New content"),
        owner: ownerSchema.optional().describe("Persona role responsible (po, dm, tl)"),
        assignee: z.string().optional().describe("Person assigned to do the work"),
        priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("New priority"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Replace tags (e.g. remove 'risk', add 'risk-mitigated')"),
      },
      async (args) => {
        const { id, content, owner, assignee, ...updates } = args;
        if (owner !== undefined) (updates as any).owner = normalizeOwner(owner);
        if (assignee !== undefined) (updates as any).assignee = assignee;
        const doc = store.update(id, updates, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated feature ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),
  ];
}
