import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";

export function createMeetingTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_meetings",
      "List all meetings in the project, optionally filtered by status",
      { status: z.string().optional().describe("Filter by status (e.g. 'scheduled', 'completed', 'cancelled')") },
      async (args) => {
        const docs = store.list({ type: "meeting", status: args.status });
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          created: d.frontmatter.created,
          tags: d.frontmatter.tags,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_meeting",
      "Get the full content of a specific meeting by ID",
      { id: z.string().describe("Meeting ID (e.g. 'M-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Meeting ${args.id} not found` }],
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
      "create_meeting",
      "Create a new meeting record",
      {
        title: z.string().describe("Title of the meeting"),
        content: z.string().describe("Meeting agenda, notes, or minutes"),
        status: z.string().optional().describe("Status (default: 'scheduled')"),
        owner: z.string().optional().describe("Meeting organizer"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
        attendees: z.array(z.string()).optional().describe("List of attendees"),
        date: z.string().optional().describe("Meeting date (ISO format)"),
      },
      async (args) => {
        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: args.status ?? "scheduled",
        };
        if (args.owner) frontmatter.owner = args.owner;
        if (args.tags) frontmatter.tags = args.tags;
        if (args.attendees) frontmatter.attendees = args.attendees;
        if (args.date) frontmatter.date = args.date;

        const doc = store.create(
          "meeting",
          frontmatter as any,
          args.content,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Created meeting ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),

    tool(
      "update_meeting",
      "Update an existing meeting",
      {
        id: z.string().describe("Meeting ID to update"),
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
              text: `Updated meeting ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),

    tool(
      "analyze_meeting",
      "Analyze a meeting to identify decisions, actions, and questions. Returns the meeting content with existing project context so you can extract and create artifacts using the create_decision, create_action, and create_question tools.",
      {
        id: z.string().describe("Meeting ID to analyze (e.g. 'M-001')"),
        include_context: z.boolean().optional().describe("Include existing artifacts for dedup awareness (default: true)"),
      },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Meeting ${args.id} not found` }],
            isError: true,
          };
        }
        if (doc.frontmatter.type !== "meeting") {
          return {
            content: [{ type: "text" as const, text: `Document ${args.id} is not a meeting (type: ${doc.frontmatter.type})` }],
            isError: true,
          };
        }

        const includeContext = args.include_context !== false;
        const sections: string[] = [];

        sections.push(`# Meeting: ${doc.frontmatter.title} (${args.id})`);
        sections.push(`**Status:** ${doc.frontmatter.status}`);
        sections.push(`**Date:** ${doc.frontmatter.date ?? doc.frontmatter.created}`);
        if (doc.frontmatter.attendees) {
          sections.push(`**Attendees:** ${(doc.frontmatter.attendees as string[]).join(", ")}`);
        }
        sections.push("");
        sections.push(doc.content);

        if (includeContext) {
          // Gather existing artifacts for dedup awareness
          const decisions = store.list({ type: "decision" });
          const actions = store.list({ type: "action" });
          const questions = store.list({ type: "question" });

          sections.push("\n---\n# Existing Artifacts (for dedup awareness)");

          if (decisions.length > 0) {
            sections.push("\n## Existing Decisions");
            for (const d of decisions) {
              sections.push(`- ${d.frontmatter.id}: ${d.frontmatter.title} [${d.frontmatter.status}]`);
            }
          }
          if (actions.length > 0) {
            sections.push("\n## Existing Actions");
            for (const a of actions) {
              sections.push(`- ${a.frontmatter.id}: ${a.frontmatter.title} [${a.frontmatter.status}]`);
            }
          }
          if (questions.length > 0) {
            sections.push("\n## Existing Questions");
            for (const q of questions) {
              sections.push(`- ${q.frontmatter.id}: ${q.frontmatter.title} [${q.frontmatter.status}]`);
            }
          }
        }

        sections.push("\n---\n# Instructions");
        sections.push(`Analyze this meeting and create artifacts using create_decision, create_action, and create_question tools.`);
        sections.push(`For each artifact, include the tag "source:${args.id}" for traceability.`);
        sections.push(`After creating artifacts, update the meeting using update_meeting to append an Outcomes section listing the created artifact IDs.`);
        sections.push(`Avoid creating duplicates of existing artifacts listed above.`);

        return {
          content: [{ type: "text" as const, text: sections.join("\n") }],
        };
      },
      { annotations: { readOnly: true } },
    ),
  ];
}
