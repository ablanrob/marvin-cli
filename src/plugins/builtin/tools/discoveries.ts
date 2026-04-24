import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";
import { ownerSchema, normalizeOwner } from "../../../personas/owner.js";
import { DISCOVERY_STATUSES } from "../../../core/statuses.js";

/** Count occurrences of a heading pattern like `### F-N:` or `### GAP-N:` in content. */
function countBlocks(content: string, prefix: string): number {
  const re = new RegExp(`^### ${prefix}-(\\d+):`, "gm");
  let count = 0;
  while (re.exec(content)) count++;
  return count;
}

export function createDiscoveryTools(store: DocumentStore): SdkMcpToolDefinition<any>[] {
  return [
    // -----------------------------------------------------------------------
    // 1. start_discovery
    // -----------------------------------------------------------------------
    tool(
      "start_discovery",
      "Start a new discovery session. Optionally chain from a parent session to carry forward open gaps and auto-increment the session number. Tags can load prior context from related artifacts.",
      {
        title: z.string().describe("Discovery session title"),
        content: z.string().describe("Initial session content / agenda"),
        stakeholder: z.string().describe("Name or role of the functional stakeholder"),
        parent: z
          .string()
          .optional()
          .describe(
            "Parent discovery ID (e.g. 'DS-001') to chain from — carries forward open gaps",
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags for categorization and context loading"),
        owner: ownerSchema.optional().describe("Persona role responsible (po, dm, tl)"),
      },
      async (args) => {
        let session = 1;
        const contentParts: string[] = [];

        // If parent provided, carry forward open gaps and increment session
        if (args.parent) {
          const parentDoc = store.get(args.parent);
          if (!parentDoc) {
            return {
              content: [
                { type: "text" as const, text: `Parent discovery ${args.parent} not found` },
              ],
              isError: true,
            };
          }
          session = ((parentDoc.frontmatter.session as number) ?? 1) + 1;

          // Extract open gaps from parent content
          const openGaps: string[] = [];
          const lines = parentDoc.content.split("\n");
          let currentGap: string[] = [];
          let inGap = false;
          for (const line of lines) {
            if (/^### GAP-\d+:/.test(line)) {
              if (inGap && currentGap.length > 0) {
                const block = currentGap.join("\n");
                if (block.includes("**Status:** open")) openGaps.push(block);
              }
              currentGap = [line];
              inGap = true;
            } else if (inGap) {
              if (/^### /.test(line) && !/^### GAP-\d+:/.test(line)) {
                const block = currentGap.join("\n");
                if (block.includes("**Status:** open")) openGaps.push(block);
                inGap = false;
                currentGap = [];
              } else {
                currentGap.push(line);
              }
            }
          }
          if (inGap && currentGap.length > 0) {
            const block = currentGap.join("\n");
            if (block.includes("**Status:** open")) openGaps.push(block);
          }

          if (openGaps.length > 0) {
            contentParts.push(`## Open Gaps from ${args.parent}\n\n${openGaps.join("\n\n")}`);
          }
        }

        // Auto-load context from tagged artifacts
        if (args.tags && args.tags.length > 0) {
          const contextItems: string[] = [];
          for (const tag of args.tags) {
            const docs = store.list({ tag });
            for (const d of docs) {
              contextItems.push(
                `- **${d.frontmatter.id}** (${d.frontmatter.type}): ${d.frontmatter.title}`,
              );
            }
          }
          if (contextItems.length > 0) {
            contentParts.push(`## Prior Context\n\n${contextItems.join("\n")}`);
          }
        }

        contentParts.push(args.content);

        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: "draft",
          stakeholder: args.stakeholder,
          session,
          tags: args.tags ?? [],
        };
        if (args.owner) frontmatter.owner = normalizeOwner(args.owner);
        if (args.parent) frontmatter.parent = args.parent;

        const doc = store.create("discovery", frontmatter as any, contentParts.join("\n\n"));
        return {
          content: [
            {
              type: "text" as const,
              text: `Created discovery ${doc.frontmatter.id}: ${doc.frontmatter.title} (session ${session})`,
            },
          ],
        };
      },
    ),

    // -----------------------------------------------------------------------
    // 2. record_finding
    // -----------------------------------------------------------------------
    tool(
      "record_finding",
      "Append a structured finding to a discovery session",
      {
        id: z.string().describe("Discovery ID (e.g. 'DS-001')"),
        finding: z.string().describe("Finding title / summary"),
        source: z
          .string()
          .describe("Where this finding came from (stakeholder quote, document, etc.)"),
        impacts: z
          .string()
          .describe("What this finding impacts (features, architecture, scope, etc.)"),
        confidence: z.enum(["high", "medium", "low"]).describe("Confidence level in this finding"),
      },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Discovery ${args.id} not found` }],
            isError: true,
          };
        }

        const n = countBlocks(doc.content, "F") + 1;
        const block = [
          `### F-${n}: ${args.finding}`,
          `**Source:** ${args.source}`,
          `**Impacts:** ${args.impacts}`,
          `**Confidence:** ${args.confidence}`,
        ].join("\n");

        store.update(args.id, {}, `${doc.content}\n\n${block}`);
        return {
          content: [
            { type: "text" as const, text: `Recorded F-${n} in ${args.id}: ${args.finding}` },
          ],
        };
      },
    ),

    // -----------------------------------------------------------------------
    // 3. record_gap
    // -----------------------------------------------------------------------
    tool(
      "record_gap",
      "Append a gap (open question / missing requirement) to a discovery session. Optionally spawn a Q-xxx question artifact.",
      {
        id: z.string().describe("Discovery ID (e.g. 'DS-001')"),
        question: z.string().describe("The gap question"),
        area: z
          .enum(["product", "technical"])
          .describe("Gap area — product (business/UX) or technical (architecture/infra)"),
        spawn_question: z
          .boolean()
          .optional()
          .describe("If true, also create a Q-xxx question artifact linked to this gap"),
      },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Discovery ${args.id} not found` }],
            isError: true,
          };
        }

        const n = countBlocks(doc.content, "GAP") + 1;
        const block = [
          `### GAP-${n}: ${args.question}`,
          `**Area:** ${args.area}`,
          `**Status:** open`,
        ].join("\n");

        store.update(args.id, {}, `${doc.content}\n\n${block}`);

        const parts = [`Recorded GAP-${n} in ${args.id}: ${args.question}`];

        if (args.spawn_question) {
          const qDoc = store.create(
            "question",
            {
              title: args.question,
              status: "open",
              tags: [`discovery:${args.id}`],
              source: `${args.id}/GAP-${n}`,
            } as any,
            `Gap identified during discovery session ${args.id}.\n\nArea: ${args.area}`,
          );
          parts.push(`Spawned ${qDoc.frontmatter.id} with tag discovery:${args.id}`);
        }

        return {
          content: [{ type: "text" as const, text: parts.join("\n") }],
        };
      },
    ),

    // -----------------------------------------------------------------------
    // 4. complete_discovery
    // -----------------------------------------------------------------------
    tool(
      "complete_discovery",
      "Complete a discovery session — validates findings/gaps and transitions to in-review",
      {
        id: z.string().describe("Discovery ID to complete (e.g. 'DS-001')"),
      },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Discovery ${args.id} not found` }],
            isError: true,
          };
        }

        const status = doc.frontmatter.status;
        if (status !== "draft" && status !== "needs-input") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Cannot complete ${args.id}: status is "${status}" (must be "draft" or "needs-input")`,
              },
            ],
            isError: true,
          };
        }

        const findingCount = countBlocks(doc.content, "F");
        const gapCount = countBlocks(doc.content, "GAP");

        const summary = [
          `## Session Summary`,
          `- **Findings:** ${findingCount}`,
          `- **Gaps:** ${gapCount}`,
          `- **Status:** Ready for review`,
        ].join("\n");

        store.update(args.id, { status: "in-review" }, `${doc.content}\n\n${summary}`);
        return {
          content: [
            {
              type: "text" as const,
              text: `Completed ${args.id} — ${findingCount} finding(s), ${gapCount} gap(s). Status: in-review`,
            },
          ],
        };
      },
    ),

    // -----------------------------------------------------------------------
    // 5. list_discoveries
    // -----------------------------------------------------------------------
    tool(
      "list_discoveries",
      "List discovery sessions, optionally filtered by status or stakeholder",
      {
        status: z.enum(DISCOVERY_STATUSES).optional().describe("Filter by status"),
        stakeholder: z.string().optional().describe("Filter by stakeholder name/role"),
      },
      async (args) => {
        const docs = store.list({ type: "discovery", status: args.status });
        const filtered = args.stakeholder
          ? docs.filter((d) => d.frontmatter.stakeholder === args.stakeholder)
          : docs;
        const summary = filtered.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          stakeholder: d.frontmatter.stakeholder,
          session: d.frontmatter.session,
          owner: d.frontmatter.owner,
          parent: d.frontmatter.parent,
          tags: d.frontmatter.tags,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    // -----------------------------------------------------------------------
    // 6. get_discovery
    // -----------------------------------------------------------------------
    tool(
      "get_discovery",
      "Get the full content of a specific discovery session by ID",
      { id: z.string().describe("Discovery ID (e.g. 'DS-001')") },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Discovery ${args.id} not found` }],
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

    // -----------------------------------------------------------------------
    // 7. add_discovery_review
    // -----------------------------------------------------------------------
    tool(
      "add_discovery_review",
      "Add a review annotation to a discovery session that is in-review",
      {
        id: z.string().describe("Discovery ID (e.g. 'DS-001')"),
        reviewer: z.string().describe("Reviewer name or role"),
        target: z.string().describe("What is being reviewed (e.g. 'F-1', 'GAP-2', 'overall')"),
        comment: z.string().describe("Review comment"),
      },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Discovery ${args.id} not found` }],
            isError: true,
          };
        }

        if (doc.frontmatter.status !== "in-review") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Cannot add review to ${args.id}: status is "${doc.frontmatter.status}" (must be "in-review")`,
              },
            ],
            isError: true,
          };
        }

        const block = `### Review [${args.reviewer}] on ${args.target}\n${args.comment}`;
        store.update(args.id, {}, `${doc.content}\n\n${block}`);
        return {
          content: [
            {
              type: "text" as const,
              text: `Added review by ${args.reviewer} on ${args.target} in ${args.id}`,
            },
          ],
        };
      },
    ),

    // -----------------------------------------------------------------------
    // 8. resolve_gap
    // -----------------------------------------------------------------------
    tool(
      "resolve_gap",
      "Resolve an open gap in a discovery session and optionally update the spawned question",
      {
        id: z.string().describe("Discovery ID (e.g. 'DS-001')"),
        gap_number: z.number().describe("Gap number to resolve (e.g. 1 for GAP-1)"),
        rationale: z.string().describe("Resolution rationale"),
      },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Discovery ${args.id} not found` }],
            isError: true,
          };
        }

        const gapHeading = `### GAP-${args.gap_number}:`;
        if (!doc.content.includes(gapHeading)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `GAP-${args.gap_number} not found in ${args.id}`,
              },
            ],
            isError: true,
          };
        }

        const newContent = doc.content.replace(
          new RegExp(`(### GAP-${args.gap_number}:[^]*?)\\*\\*Status:\\*\\* open`),
          `$1**Status:** resolved\n**Resolution:** ${args.rationale}`,
        );

        store.update(args.id, {}, newContent);

        // Also update any spawned question
        const parts = [`Resolved GAP-${args.gap_number} in ${args.id}`];
        const questions = store.list({ type: "question", tag: `discovery:${args.id}` });
        for (const q of questions) {
          if (
            q.frontmatter.source === `${args.id}/GAP-${args.gap_number}` &&
            q.frontmatter.status !== "answered"
          ) {
            store.update(q.frontmatter.id, { status: "answered" });
            parts.push(`Updated ${q.frontmatter.id} to answered`);
          }
        }

        return {
          content: [{ type: "text" as const, text: parts.join("\n") }],
        };
      },
    ),

    // -----------------------------------------------------------------------
    // 9. request_followup
    // -----------------------------------------------------------------------
    tool(
      "request_followup",
      "Request a follow-up on a discovery session — transitions to needs-input and lists unresolved items",
      {
        id: z.string().describe("Discovery ID (e.g. 'DS-001')"),
        reason: z.string().describe("Reason for requesting follow-up"),
      },
      async (args) => {
        const doc = store.get(args.id);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `Discovery ${args.id} not found` }],
            isError: true,
          };
        }

        if (doc.frontmatter.status !== "in-review") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Cannot request follow-up on ${args.id}: status is "${doc.frontmatter.status}" (must be "in-review")`,
              },
            ],
            isError: true,
          };
        }

        // Collect unresolved gaps
        const unresolvedGaps: string[] = [];
        const lines = doc.content.split("\n");
        let currentGapTitle = "";
        let inGap = false;
        let blockLines: string[] = [];
        for (const line of lines) {
          if (/^### GAP-\d+:/.test(line)) {
            if (inGap && blockLines.join("\n").includes("**Status:** open")) {
              unresolvedGaps.push(currentGapTitle);
            }
            currentGapTitle = line.replace(/^### /, "").trim();
            inGap = true;
            blockLines = [line];
          } else if (inGap) {
            if (/^### /.test(line) && !/^### GAP-\d+:/.test(line)) {
              if (blockLines.join("\n").includes("**Status:** open")) {
                unresolvedGaps.push(currentGapTitle);
              }
              inGap = false;
              blockLines = [];
            } else {
              blockLines.push(line);
            }
          }
        }
        if (inGap && blockLines.join("\n").includes("**Status:** open")) {
          unresolvedGaps.push(currentGapTitle);
        }

        const followUpItems =
          unresolvedGaps.length > 0
            ? unresolvedGaps.map((g) => `- ${g}`).join("\n")
            : "- (none identified)";

        const block = [
          `## Follow-up Requested`,
          `**Reason:** ${args.reason}`,
          ``,
          `### Unresolved Items`,
          followUpItems,
        ].join("\n");

        store.update(args.id, { status: "needs-input" }, `${doc.content}\n\n${block}`);
        return {
          content: [
            {
              type: "text" as const,
              text: `Requested follow-up on ${args.id}. Status: needs-input. ${unresolvedGaps.length} unresolved gap(s).`,
            },
          ],
        };
      },
    ),
  ];
}
