import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../storage/store.js";
import { propagateProgressToAction } from "../../storage/progress.js";

function findMatchingSprints(
  store: DocumentStore,
  dueDate: string,
): { id: string; title: string; startDate: string; endDate: string }[] {
  const sprints = store.list({ type: "sprint" });
  return sprints
    .filter((s) => {
      const start = s.frontmatter.startDate as string | undefined;
      const end = s.frontmatter.endDate as string | undefined;
      return start && end && dueDate >= start && dueDate <= end;
    })
    .map((s) => ({
      id: s.frontmatter.id,
      title: s.frontmatter.title,
      startDate: s.frontmatter.startDate as string,
      endDate: s.frontmatter.endDate as string,
    }));
}

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
        const summary = docs.map((d) => {
          const sprintIds = (d.frontmatter.tags ?? [])
            .filter((t) => t.startsWith("sprint:"))
            .map((t) => t.slice(7));
          return {
            id: d.frontmatter.id,
            title: d.frontmatter.title,
            status: d.frontmatter.status,
            owner: d.frontmatter.owner,
            priority: d.frontmatter.priority,
            dueDate: d.frontmatter.dueDate,
            sprints: sprintIds.length > 0 ? sprintIds : undefined,
            created: d.frontmatter.created,
          };
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
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
      { annotations: { readOnlyHint: true } },
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
        dueDate: z.string().optional().describe("Due date in ISO format (e.g. '2026-03-15')"),
        sprints: z.array(z.string()).optional().describe("Sprint IDs to assign (e.g. ['SP-001']). Adds sprint:SP-xxx tags."),
        workStream: z.string().optional().describe("Work stream name (e.g. 'Budget UX'). Adds a stream:<value> tag."),
      },
      async (args) => {
        const tags = [...(args.tags ?? [])];
        if (args.sprints) {
          for (const sprintId of args.sprints) {
            const tag = `sprint:${sprintId}`;
            if (!tags.includes(tag)) tags.push(tag);
          }
        }
        if (args.workStream) {
          tags.push(`stream:${args.workStream}`);
        }

        const doc = store.create(
          "action",
          {
            title: args.title,
            status: args.status,
            owner: args.owner,
            priority: args.priority,
            tags: tags.length > 0 ? tags : undefined,
            dueDate: args.dueDate,
          },
          args.content,
        );

        const parts = [`Created action ${doc.frontmatter.id}: ${doc.frontmatter.title}`];

        // If dueDate set but no sprints provided, suggest matching sprints
        if (args.dueDate && (!args.sprints || args.sprints.length === 0)) {
          const matching = findMatchingSprints(store, args.dueDate);
          if (matching.length > 0) {
            const suggestions = matching
              .map((s) => `${s.id} "${s.title}" (${s.startDate} – ${s.endDate})`)
              .join(", ");
            parts.push(`Suggested sprints for dueDate ${args.dueDate}: ${suggestions}. Use the sprints parameter or update_action to assign.`);
          }
        }

        return {
          content: [{ type: "text" as const, text: parts.join("\n") }],
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
        dueDate: z.string().optional().describe("Due date in ISO format (e.g. '2026-03-15')"),
        tags: z.array(z.string()).optional().describe("Replace all tags. When provided with sprints, sprint tags are merged into this array."),
        sprints: z.array(z.string()).optional().describe("Sprint IDs to assign (replaces existing sprint tags). E.g. ['SP-001']."),
        workStream: z.string().optional().describe("Work stream name (e.g. 'Budget UX'). Replaces existing stream:<value> tag."),
        progress: z.number().optional().describe("Explicit progress percentage (0-100)."),
      },
      async (args) => {
        const { id, content, sprints, tags, workStream, progress, ...updates } = args;

        if (tags !== undefined) {
          // tags takes precedence — merge sprint tags into the provided array
          const merged = [...tags];
          if (sprints) {
            for (const s of sprints) {
              const tag = `sprint:${s}`;
              if (!merged.includes(tag)) merged.push(tag);
            }
          }
          if (workStream !== undefined) {
            const filtered = merged.filter((t) => !t.startsWith("stream:"));
            filtered.push(`stream:${workStream}`);
            (updates as any).tags = filtered;
          } else {
            (updates as any).tags = merged;
          }
        } else if (sprints !== undefined || workStream !== undefined) {
          const existing = store.get(id);
          if (!existing) {
            return {
              content: [{ type: "text" as const, text: `Action ${id} not found` }],
              isError: true,
            };
          }
          let existingTags: string[] = existing.frontmatter.tags ?? [];
          if (sprints !== undefined) {
            existingTags = existingTags.filter((t) => !t.startsWith("sprint:"));
            existingTags.push(...sprints.map((s) => `sprint:${s}`));
          }
          if (workStream !== undefined) {
            existingTags = existingTags.filter((t) => !t.startsWith("stream:"));
            existingTags.push(`stream:${workStream}`);
          }
          (updates as any).tags = existingTags;
        }

        // Include progress in frontmatter updates
        if (typeof progress === "number") {
          (updates as any).progress = Math.max(0, Math.min(100, Math.round(progress)));
          (updates as any).progressOverride = true;
        }

        const doc = store.update(id, updates, content);

        // Propagate progress if status or progress changed
        if (args.status !== undefined || typeof progress === "number") {
          propagateProgressToAction(store, id);
        }

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

    tool(
      "suggest_sprints_for_action",
      "Suggest sprints whose date range contains the given due date. Helps assign actions to the right sprint.",
      {
        dueDate: z.string().describe("Due date in ISO format (e.g. '2026-03-15')"),
      },
      async (args) => {
        const matching = findMatchingSprints(store, args.dueDate);
        if (matching.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No sprints found containing dueDate ${args.dueDate}.`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(matching, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),
  ];
}
