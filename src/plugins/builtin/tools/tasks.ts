import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";
import { normalizeLinkedEpics, generateEpicTags } from "./task-utils.js";

/**
 * Schema that advertises `type: array` but also accepts a JSON-stringified
 * array or a bare string (coerced to `[value]`).  Claude sometimes serializes
 * arrays as strings when calling MCP tools — z.preprocess handles that before
 * Zod validation runs, while the JSON Schema output stays `{ type: "array" }`.
 */
const linkedEpicArray = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* not JSON — treat as single ID */ }
      return [val];
    }
    return val;
  },
  z.array(z.string()),
);

export function createTaskTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_tasks",
      "List all tasks in the project, optionally filtered by status, linked epic, or priority",
      {
        status: z
          .enum(["backlog", "ready", "in-progress", "review", "done"])
          .optional()
          .describe("Filter by task status"),
        linkedEpic: z
          .string()
          .optional()
          .describe("Filter by linked epic ID (e.g. 'E-001')"),
        priority: z
          .enum(["critical", "high", "medium", "low"])
          .optional()
          .describe("Filter by priority"),
      },
      async (args) => {
        let docs = store.list({ type: "task", status: args.status });
        if (args.linkedEpic) {
          docs = docs.filter((d) =>
            normalizeLinkedEpics(d.frontmatter.linkedEpic).includes(args.linkedEpic!),
          );
        }
        if (args.priority) {
          docs = docs.filter((d) => d.frontmatter.priority === args.priority);
        }
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          linkedEpic: normalizeLinkedEpics(d.frontmatter.linkedEpic),
          priority: d.frontmatter.priority,
          complexity: d.frontmatter.complexity,
          estimatedPoints: d.frontmatter.estimatedPoints,
          tags: d.frontmatter.tags,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "get_task",
      "Get the full content of a specific task by ID",
      { id: z.string().describe("Task ID (e.g. 'T-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Task ${args.id} not found` }],
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
      "create_task",
      "Create a new implementation task linked to one or more epics. The linked epic is soft-validated (warns if not found, but does not block creation).",
      {
        title: z.string().describe("Task title"),
        content: z.string().describe("Task description and implementation details"),
        linkedEpic: linkedEpicArray.describe("Epic ID(s) to link this task to (e.g. ['E-001'] or ['E-001', 'E-002'])"),
        status: z
          .enum(["backlog", "ready", "in-progress", "review", "done"])
          .optional()
          .describe("Task status (default: 'backlog')"),
        acceptanceCriteria: z.string().optional().describe("Acceptance criteria for the task"),
        technicalNotes: z.string().optional().describe("Technical implementation notes"),
        estimatedPoints: z.number().optional().describe("Story point estimate"),
        complexity: z
          .enum(["trivial", "simple", "moderate", "complex", "very-complex"])
          .optional()
          .describe("Task complexity"),
        priority: z
          .enum(["critical", "high", "medium", "low"])
          .optional()
          .describe("Task priority"),
        tags: z.array(z.string()).optional().describe("Additional tags"),
      },
      async (args) => {
        const linkedEpics = normalizeLinkedEpics(args.linkedEpic);
        const warnings: string[] = [];

        // Soft validation: warn if epic not found, don't block
        for (const epicId of linkedEpics) {
          const epic = store.get(epicId);
          if (!epic) {
            warnings.push(`Warning: Epic ${epicId} not found`);
          } else if (epic.frontmatter.type !== "epic") {
            warnings.push(`Warning: ${epicId} is a ${epic.frontmatter.type}, not an epic`);
          }
        }

        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: args.status ?? "backlog",
          linkedEpic: linkedEpics,
          tags: [...generateEpicTags(linkedEpics), ...(args.tags ?? [])],
        };
        if (args.acceptanceCriteria) frontmatter.acceptanceCriteria = args.acceptanceCriteria;
        if (args.technicalNotes) frontmatter.technicalNotes = args.technicalNotes;
        if (args.estimatedPoints !== undefined) frontmatter.estimatedPoints = args.estimatedPoints;
        if (args.complexity) frontmatter.complexity = args.complexity;
        if (args.priority) frontmatter.priority = args.priority;

        const doc = store.create("task", frontmatter as any, args.content);

        const parts = [
          `Created task ${doc.frontmatter.id}: ${doc.frontmatter.title} (linked to ${linkedEpics.join(", ")})`,
        ];
        if (warnings.length > 0) {
          parts.push(warnings.join("; "));
        }
        return {
          content: [{ type: "text" as const, text: parts.join("\n") }],
        };
      },
    ),

    tool(
      "update_task",
      "Update an existing task, including its linked epics.",
      {
        id: z.string().describe("Task ID to update"),
        title: z.string().optional().describe("New title"),
        status: z
          .enum(["backlog", "ready", "in-progress", "review", "done"])
          .optional()
          .describe("New status"),
        content: z.string().optional().describe("New content"),
        linkedEpic: linkedEpicArray.optional().describe("New linked epic ID(s)"),
        acceptanceCriteria: z.string().optional().describe("New acceptance criteria"),
        technicalNotes: z.string().optional().describe("New technical notes"),
        estimatedPoints: z.number().optional().describe("New story point estimate"),
        complexity: z
          .enum(["trivial", "simple", "moderate", "complex", "very-complex"])
          .optional()
          .describe("New complexity"),
        priority: z
          .enum(["critical", "high", "medium", "low"])
          .optional()
          .describe("New priority"),
        tags: z.array(z.string()).optional().describe("Replace tags (e.g. remove old tags, add new ones)"),
      },
      async (args) => {
        const { id, content, linkedEpic: rawLinkedEpic, tags: userTags, ...updates } = args;
        const warnings: string[] = [];

        // If linkedEpic is being changed, soft-validate
        if (rawLinkedEpic !== undefined) {
          const linkedEpics = normalizeLinkedEpics(rawLinkedEpic);

          for (const epicId of linkedEpics) {
            const epic = store.get(epicId);
            if (!epic) {
              warnings.push(`Warning: Epic ${epicId} not found`);
            } else if (epic.frontmatter.type !== "epic") {
              warnings.push(`Warning: ${epicId} is a ${epic.frontmatter.type}, not an epic`);
            }
          }

          (updates as Record<string, unknown>).linkedEpic = linkedEpics;

          // Regenerate tags: replace epic:* tags, preserve non-epic tags
          const existingDoc = store.get(id);
          const existingTags: string[] = existingDoc?.frontmatter.tags ?? [];
          const nonEpicTags = existingTags.filter((t) => !t.startsWith("epic:"));
          const baseTags = userTags ?? nonEpicTags;
          (updates as Record<string, unknown>).tags = [...generateEpicTags(linkedEpics), ...baseTags];
        } else if (userTags !== undefined) {
          (updates as Record<string, unknown>).tags = userTags;
        }

        const doc = store.update(id, updates, content);

        const parts = [`Updated task ${doc.frontmatter.id}: ${doc.frontmatter.title}`];
        if (warnings.length > 0) {
          parts.push(warnings.join("; "));
        }
        return {
          content: [{ type: "text" as const, text: parts.join("\n") }],
        };
      },
    ),
  ];
}
