import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";

export function createEpicTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_epics",
      "List all epics in the project, optionally filtered by status or linked feature",
      {
        status: z
          .enum(["planned", "in-progress", "done"])
          .optional()
          .describe("Filter by epic status"),
        linkedFeature: z
          .string()
          .optional()
          .describe("Filter by linked feature ID (e.g. 'F-001')"),
      },
      async (args) => {
        let docs = store.list({ type: "epic", status: args.status });
        if (args.linkedFeature) {
          docs = docs.filter(
            (d) => d.frontmatter.linkedFeature === args.linkedFeature,
          );
        }
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          linkedFeature: d.frontmatter.linkedFeature,
          owner: d.frontmatter.owner,
          targetDate: d.frontmatter.targetDate,
          estimatedEffort: d.frontmatter.estimatedEffort,
          tags: d.frontmatter.tags,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_epic",
      "Get the full content of a specific epic by ID",
      { id: z.string().describe("Epic ID (e.g. 'E-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Epic ${args.id} not found` }],
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
      "create_epic",
      "Create a new epic linked to an approved feature. The linked feature must exist and be approved.",
      {
        title: z.string().describe("Epic title"),
        content: z.string().describe("Epic description and scope"),
        linkedFeature: z.string().describe("Feature ID to link this epic to (e.g. 'F-001')"),
        status: z
          .enum(["planned", "in-progress", "done"])
          .optional()
          .describe("Epic status (default: 'planned')"),
        owner: z.string().optional().describe("Epic owner"),
        targetDate: z.string().optional().describe("Target completion date (ISO format)"),
        estimatedEffort: z.string().optional().describe("Estimated effort (e.g. '2 weeks', '5 story points')"),
        tags: z.array(z.string()).optional().describe("Additional tags"),
      },
      async (args) => {
        // Hard validation: linked feature must exist and be approved
        const feature = store.get(args.linkedFeature);
        if (!feature) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Feature ${args.linkedFeature} not found`,
              },
            ],
            isError: true,
          };
        }
        if (feature.frontmatter.type !== "feature") {
          return {
            content: [
              {
                type: "text" as const,
                text: `${args.linkedFeature} is a ${feature.frontmatter.type}, not a feature`,
              },
            ],
            isError: true,
          };
        }
        if (feature.frontmatter.status !== "approved") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Feature ${args.linkedFeature} has status '${feature.frontmatter.status}'. Only approved features can have epics. Ask the Product Owner to approve it first.`,
              },
            ],
            isError: true,
          };
        }

        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: args.status ?? "planned",
          linkedFeature: args.linkedFeature,
          tags: [`feature:${args.linkedFeature}`, ...(args.tags ?? [])],
        };
        if (args.owner) frontmatter.owner = args.owner;
        if (args.targetDate) frontmatter.targetDate = args.targetDate;
        if (args.estimatedEffort) frontmatter.estimatedEffort = args.estimatedEffort;

        const doc = store.create("epic", frontmatter as any, args.content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Created epic ${doc.frontmatter.id}: ${doc.frontmatter.title} (linked to ${args.linkedFeature})`,
            },
          ],
        };
      },
    ),

    tool(
      "update_epic",
      "Update an existing epic. The linked feature cannot be changed.",
      {
        id: z.string().describe("Epic ID to update"),
        title: z.string().optional().describe("New title"),
        status: z
          .enum(["planned", "in-progress", "done"])
          .optional()
          .describe("New status"),
        content: z.string().optional().describe("New content"),
        owner: z.string().optional().describe("New owner"),
        targetDate: z.string().optional().describe("New target date"),
        estimatedEffort: z.string().optional().describe("New estimated effort"),
      },
      async (args) => {
        const { id, content, ...updates } = args;
        const doc = store.update(id, updates, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated epic ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),
  ];
}
