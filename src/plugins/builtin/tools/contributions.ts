import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";

export function createContributionTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_contributions",
      "List all contributions in the project, optionally filtered by persona, contribution type, or status",
      {
        persona: z.string().optional().describe("Filter by persona (e.g. 'tech-lead', 'product-owner')"),
        contributionType: z.string().optional().describe("Filter by contribution type (e.g. 'action-result', 'risk-finding')"),
        status: z.string().optional().describe("Filter by status"),
      },
      async (args) => {
        let docs = store.list({ type: "contribution", status: args.status });
        if (args.persona) {
          docs = docs.filter((d) => d.frontmatter.persona === args.persona);
        }
        if (args.contributionType) {
          docs = docs.filter((d) => d.frontmatter.contributionType === args.contributionType);
        }
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          persona: d.frontmatter.persona,
          contributionType: d.frontmatter.contributionType,
          aboutArtifact: d.frontmatter.aboutArtifact,
          created: d.frontmatter.created,
          tags: d.frontmatter.tags,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "get_contribution",
      "Get the full content of a specific contribution by ID",
      { id: z.string().describe("Contribution ID (e.g. 'C-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Contribution ${args.id} not found` }],
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
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "create_contribution",
      "Create a new contribution record from a persona",
      {
        title: z.string().describe("Title of the contribution"),
        content: z.string().describe("Contribution content — the input from the persona"),
        persona: z.string().describe("Persona making the contribution (e.g. 'tech-lead')"),
        contributionType: z.string().describe("Type of contribution (e.g. 'action-result', 'risk-finding')"),
        aboutArtifact: z.string().describe("Artifact ID this contribution relates to (e.g. 'A-001', 'T-003')"),
        status: z.string().optional().describe("Status (default: 'done')"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
        workStream: z.string().optional().describe("Work stream name (e.g. 'Budget UX'). Adds a stream:<value> tag."),
      },
      async (args) => {
        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: args.status ?? "done",
          persona: args.persona,
          contributionType: args.contributionType,
        };
        frontmatter.aboutArtifact = args.aboutArtifact;
        const tags = [...(args.tags ?? [])];
        if (args.workStream) tags.push(`stream:${args.workStream}`);
        if (tags.length > 0) frontmatter.tags = tags;

        const doc = store.create("contribution", frontmatter as any, args.content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Created contribution ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),

    tool(
      "update_contribution",
      "Update an existing contribution (e.g. to append an Effects section)",
      {
        id: z.string().describe("Contribution ID to update"),
        title: z.string().optional().describe("New title"),
        status: z.string().optional().describe("New status"),
        content: z.string().optional().describe("New content"),
        workStream: z.string().optional().describe("Work stream name (e.g. 'Budget UX'). Replaces existing stream:<value> tag."),
      },
      async (args) => {
        const { id, content, workStream, ...updates } = args;
        if (workStream !== undefined) {
          const existing = store.get(id);
          const existingTags: string[] = existing?.frontmatter.tags ?? [];
          const filtered = existingTags.filter((t) => !t.startsWith("stream:"));
          filtered.push(`stream:${workStream}`);
          (updates as any).tags = filtered;
        }
        const doc = store.update(id, updates, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated contribution ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),
  ];
}
