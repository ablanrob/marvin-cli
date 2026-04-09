import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";
import { normalizeLinkedFeatures, generateFeatureTags } from "./epic-utils.js";
import { ownerSchema, normalizeOwner } from "../../../personas/owner.js";
import { EPIC_STATUSES } from "../../../core/statuses.js";

/**
 * Schema that advertises `type: array` but also accepts a JSON-stringified
 * array or a bare string (coerced to `[value]`).  Claude sometimes serializes
 * arrays as strings when calling MCP tools — z.preprocess handles that before
 * Zod validation runs, while the JSON Schema output stays `{ type: "array" }`.
 */
const linkedFeatureArray = z.preprocess((val) => {
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* not JSON — treat as single ID */
    }
    return [val];
  }
  return val;
}, z.array(z.string()));

export function createEpicTools(store: DocumentStore): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_epics",
      "List all epics in the project, optionally filtered by status or linked feature",
      {
        status: z
          .enum(["planned", "in-progress", "done"])
          .optional()
          .describe("Filter by epic status"),
        linkedFeature: z.string().optional().describe("Filter by linked feature ID (e.g. 'F-001')"),
      },
      async (args) => {
        let docs = store.list({ type: "epic", status: args.status });
        if (args.linkedFeature) {
          docs = docs.filter((d) =>
            normalizeLinkedFeatures(d.frontmatter.linkedFeature).includes(args.linkedFeature!),
          );
        }
        const summary = docs.map((d) => ({
          id: d.frontmatter.id,
          title: d.frontmatter.title,
          status: d.frontmatter.status,
          linkedFeature: normalizeLinkedFeatures(d.frontmatter.linkedFeature),
          owner: d.frontmatter.owner,
          targetDate: d.frontmatter.targetDate,
          estimatedEffort: d.frontmatter.estimatedEffort,
          tags: d.frontmatter.tags,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
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
              text: JSON.stringify({ ...doc.frontmatter, content: doc.content }, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "create_epic",
      "Create a new epic linked to one or more approved features. All linked features must exist and be approved.",
      {
        title: z.string().describe("Epic title"),
        content: z.string().describe("Epic description and scope"),
        linkedFeature: linkedFeatureArray.describe(
          "Feature ID(s) to link this epic to (e.g. ['F-001'] or ['F-001', 'F-002'])",
        ),
        status: z
          .enum(["planned", "in-progress", "done"])
          .optional()
          .describe("Epic status (default: 'planned')"),
        owner: ownerSchema.optional().describe("Persona role responsible (po, dm, tl)"),
        assignee: z.string().optional().describe("Person assigned to do the work"),
        targetDate: z.string().optional().describe("Target completion date (ISO format)"),
        estimatedEffort: z
          .string()
          .optional()
          .describe("Estimated effort (e.g. '2 weeks', '5 story points')"),
        tags: z.array(z.string()).optional().describe("Additional tags"),
      },
      async (args) => {
        const linkedFeatures = normalizeLinkedFeatures(args.linkedFeature);

        // Hard validation: all linked features must exist and be approved
        for (const featureId of linkedFeatures) {
          const feature = store.get(featureId);
          if (!feature) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Feature ${featureId} not found`,
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
                  text: `${featureId} is a ${feature.frontmatter.type}, not a feature`,
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
                  text: `Feature ${featureId} has status '${feature.frontmatter.status}'. Only approved features can have epics. Ask the Product Owner to approve it first.`,
                },
              ],
              isError: true,
            };
          }
        }

        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: args.status ?? "planned",
          linkedFeature: linkedFeatures,
          tags: [...generateFeatureTags(linkedFeatures), ...(args.tags ?? [])],
        };
        if (args.owner) frontmatter.owner = normalizeOwner(args.owner);
        if (args.assignee) frontmatter.assignee = args.assignee;
        if (args.targetDate) frontmatter.targetDate = args.targetDate;
        if (args.estimatedEffort) frontmatter.estimatedEffort = args.estimatedEffort;

        const doc = store.create("epic", frontmatter as any, args.content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Created epic ${doc.frontmatter.id}: ${doc.frontmatter.title} (linked to ${linkedFeatures.join(", ")})`,
            },
          ],
        };
      },
    ),

    tool(
      "update_epic",
      "Update an existing epic, including its linked features.",
      {
        id: z.string().describe("Epic ID to update"),
        title: z.string().optional().describe("New title"),
        status: z.enum(EPIC_STATUSES).optional().describe("New status"),
        content: z.string().optional().describe("New content"),
        owner: ownerSchema.optional().describe("Persona role responsible (po, dm, tl)"),
        assignee: z.string().optional().describe("Person assigned to do the work"),
        targetDate: z.string().optional().describe("New target date"),
        estimatedEffort: z.string().optional().describe("New estimated effort"),
        linkedFeature: linkedFeatureArray.optional().describe("New linked feature ID(s)"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Replace tags (e.g. remove 'risk', add 'risk-mitigated')"),
      },
      async (args) => {
        const {
          id,
          content,
          linkedFeature: rawLinkedFeature,
          tags: userTags,
          owner,
          assignee,
          ...updates
        } = args;
        if (owner !== undefined) (updates as any).owner = normalizeOwner(owner);
        if (assignee !== undefined) (updates as any).assignee = assignee;

        // If linkedFeature is being changed, validate all new features
        if (rawLinkedFeature !== undefined) {
          const linkedFeatures = normalizeLinkedFeatures(rawLinkedFeature);
          for (const featureId of linkedFeatures) {
            const feature = store.get(featureId);
            if (!feature) {
              return {
                content: [{ type: "text" as const, text: `Feature ${featureId} not found` }],
                isError: true,
              };
            }
            if (feature.frontmatter.type !== "feature") {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `${featureId} is a ${feature.frontmatter.type}, not a feature`,
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
                    text: `Feature ${featureId} has status '${feature.frontmatter.status}'. Only approved features can have epics. Ask the Product Owner to approve it first.`,
                  },
                ],
                isError: true,
              };
            }
          }

          (updates as Record<string, unknown>).linkedFeature = linkedFeatures;

          // Regenerate tags: replace feature:* tags, preserve non-feature tags
          const existingDoc = store.get(id);
          const existingTags: string[] = existingDoc?.frontmatter.tags ?? [];
          const nonFeatureTags = existingTags.filter((t) => !t.startsWith("feature:"));
          const baseTags = userTags ?? nonFeatureTags;
          (updates as Record<string, unknown>).tags = [
            ...generateFeatureTags(linkedFeatures),
            ...baseTags,
          ];
        } else if (userTags !== undefined) {
          (updates as Record<string, unknown>).tags = userTags;
        }

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
