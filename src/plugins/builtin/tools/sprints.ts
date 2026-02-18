import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";

export function createSprintTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_sprints",
      "List all sprints in the project, optionally filtered by status",
      {
        status: z
          .enum(["planned", "active", "completed", "cancelled"])
          .optional()
          .describe("Filter by sprint status"),
      },
      async (args) => {
        const docs = store.list({ type: "sprint", status: args.status });
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          goal: d.frontmatter.goal,
          startDate: d.frontmatter.startDate,
          endDate: d.frontmatter.endDate,
          linkedEpics: d.frontmatter.linkedEpics,
          tags: d.frontmatter.tags,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_sprint",
      "Get the full content of a specific sprint by ID",
      { id: z.string().describe("Sprint ID (e.g. 'SP-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Sprint ${args.id} not found` }],
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
      "create_sprint",
      "Create a new sprint with dates, goal, and optionally linked epics",
      {
        title: z.string().describe("Sprint title"),
        content: z.string().describe("Sprint description and objectives"),
        goal: z.string().describe("Sprint goal — what this sprint aims to deliver"),
        startDate: z.string().describe("Sprint start date (ISO format, e.g. '2026-03-01')"),
        endDate: z.string().describe("Sprint end date (ISO format, e.g. '2026-03-14')"),
        status: z
          .enum(["planned", "active", "completed", "cancelled"])
          .optional()
          .describe("Sprint status (default: 'planned')"),
        linkedEpics: z
          .array(z.string())
          .optional()
          .describe("Epic IDs to link (e.g. ['E-001', 'E-003']). Soft-validated: warns if not found but still creates."),
        tags: z.array(z.string()).optional().describe("Additional tags"),
      },
      async (args) => {
        // Soft-validate linked epics
        const warnings: string[] = [];
        if (args.linkedEpics) {
          for (const epicId of args.linkedEpics) {
            const epic = store.get(epicId);
            if (!epic) {
              warnings.push(`Epic ${epicId} not found (linked anyway)`);
            }
          }
        }

        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: args.status ?? "planned",
          goal: args.goal,
          startDate: args.startDate,
          endDate: args.endDate,
          linkedEpics: args.linkedEpics ?? [],
          tags: [...(args.tags ?? [])],
        };

        const doc = store.create("sprint", frontmatter as any, args.content);
        const sprintId = doc.frontmatter.id;

        // Auto-tag linked epics with sprint:SP-xxx
        if (args.linkedEpics) {
          for (const epicId of args.linkedEpics) {
            const epic = store.get(epicId);
            if (epic) {
              const existingTags: string[] = epic.frontmatter.tags ?? [];
              const sprintTag = `sprint:${sprintId}`;
              if (!existingTags.includes(sprintTag)) {
                store.update(epicId, { tags: [...existingTags, sprintTag] });
              }
            }
          }
        }

        const parts = [`Created sprint ${sprintId}: ${doc.frontmatter.title}`];
        if (warnings.length > 0) {
          parts.push(`Warnings: ${warnings.join("; ")}`);
        }

        return {
          content: [{ type: "text" as const, text: parts.join("\n") }],
        };
      },
    ),

    tool(
      "update_sprint",
      "Update an existing sprint. Cannot change id or type.",
      {
        id: z.string().describe("Sprint ID to update"),
        title: z.string().optional().describe("New title"),
        status: z
          .enum(["planned", "active", "completed", "cancelled"])
          .optional()
          .describe("New status"),
        content: z.string().optional().describe("New content"),
        goal: z.string().optional().describe("New sprint goal"),
        startDate: z.string().optional().describe("New start date"),
        endDate: z.string().optional().describe("New end date"),
        linkedEpics: z
          .array(z.string())
          .optional()
          .describe("New list of linked epic IDs (replaces existing)"),
        tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
      },
      async (args) => {
        const { id, content, linkedEpics, ...updates } = args;

        const existing = store.get(id);
        if (!existing) {
          return {
            content: [{ type: "text" as const, text: `Sprint ${id} not found` }],
            isError: true,
          };
        }

        // Handle linkedEpics change: re-tag affected epics
        if (linkedEpics !== undefined) {
          const oldLinked: string[] = existing.frontmatter.linkedEpics ?? [];
          const sprintTag = `sprint:${id}`;

          // Remove sprint tag from epics no longer linked
          const removed = oldLinked.filter((e) => !linkedEpics.includes(e));
          for (const epicId of removed) {
            const epic = store.get(epicId);
            if (epic) {
              const tags: string[] = epic.frontmatter.tags ?? [];
              const filtered = tags.filter((t) => t !== sprintTag);
              if (filtered.length !== tags.length) {
                store.update(epicId, { tags: filtered });
              }
            }
          }

          // Add sprint tag to newly linked epics
          const added = linkedEpics.filter((e) => !oldLinked.includes(e));
          for (const epicId of added) {
            const epic = store.get(epicId);
            if (epic) {
              const tags: string[] = epic.frontmatter.tags ?? [];
              if (!tags.includes(sprintTag)) {
                store.update(epicId, { tags: [...tags, sprintTag] });
              }
            }
          }

          (updates as any).linkedEpics = linkedEpics;
        }

        const doc = store.update(id, updates, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated sprint ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),
  ];
}
