import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { MarvinProjectConfig } from "../core/config.js";
import type { Methodology, ConceptCategory } from "./types.js";
import { getConceptRegistry } from "./registry.js";

export function createConceptTools(config?: MarvinProjectConfig): SdkMcpToolDefinition<any>[] {
  const methodology = (config?.methodology as Methodology) ?? "generic-agile";

  return [
    tool(
      "list_concepts",
      "List all methodology concepts Marvin knows about, optionally filtered by category or methodology. Returns concept summaries (id, name, category, methodology, summary).",
      {
        category: z
          .enum(["phase", "artifact-type", "ritual", "role", "gate", "loop"])
          .optional()
          .describe("Filter by concept category"),
        methodology: z
          .enum(["aem", "generic-agile"])
          .optional()
          .describe("Filter by methodology. Defaults to the project's configured methodology."),
      },
      async (args) => {
        const registry = getConceptRegistry();
        const filterMethodology = args.methodology ?? methodology;
        const concepts = registry.list({
          category: args.category as ConceptCategory | undefined,
          methodology: filterMethodology as Methodology,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ concepts }, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "explain_concept",
      "Get the canonical structured definition for a methodology concept. Returns definition, when_to_use, optional checklist, and related artifacts/tools/personas/concepts. Use list_concepts to discover available concept IDs.",
      {
        id: z.string().describe("Concept ID (kebab-case, e.g. 'sprint-0', 'assess-use-case')"),
      },
      async (args) => {
        const registry = getConceptRegistry();
        const concept = registry.explain(args.id, methodology);

        if (!concept) {
          const available = registry.ids().join(", ");
          return {
            content: [
              {
                type: "text" as const,
                text: `Concept "${args.id}" not found. Use list_concepts() to see available concepts. Available IDs: ${available}`,
              },
            ],
            isError: true,
          };
        }

        // Build response omitting undefined optional fields
        const response: Record<string, unknown> = {
          id: concept.id,
          name: concept.name,
          category: concept.category,
          methodology: concept.methodology,
          definition: concept.definition,
        };

        if (concept.whenToUse) response.whenToUse = concept.whenToUse;
        if (concept.checklist?.length) response.checklist = concept.checklist;
        if (concept.relatedArtifacts?.length) response.relatedArtifacts = concept.relatedArtifacts;
        if (concept.relatedTools?.length) response.relatedTools = concept.relatedTools;
        if (concept.relatedPersonas?.length) response.relatedPersonas = concept.relatedPersonas;
        if (concept.relatedConcepts?.length) response.relatedConcepts = concept.relatedConcepts;
        response.source = concept.source;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "explain_phase",
      "Convenience shortcut for explain_concept filtered to AEM phases. Accepts phase ID or human-readable name (e.g. 'assess-use-case' or 'Assess Use Case').",
      {
        name: z.string().describe("Phase ID or human name"),
      },
      async (args) => {
        const registry = getConceptRegistry();

        // Try direct ID match first
        let concept = registry.explain(args.name, methodology);

        // Try matching by human name (case-insensitive)
        if (!concept) {
          const phases = registry.list({ category: "phase" });
          const match = phases.find((p) => p.name.toLowerCase() === args.name.toLowerCase());
          if (match) {
            concept = registry.explain(match.id, methodology);
          }
        }

        if (!concept) {
          const phases = registry.list({ category: "phase" });
          const available = phases.map((p) => `${p.id} ("${p.name}")`).join(", ");
          return {
            content: [
              {
                type: "text" as const,
                text: `Phase "${args.name}" not found. Available phases: ${available}`,
              },
            ],
            isError: true,
          };
        }

        if (concept.category !== "phase") {
          return {
            content: [
              {
                type: "text" as const,
                text: `"${args.name}" is a ${concept.category}, not a phase. Use explain_concept("${concept.id}") instead.`,
              },
            ],
            isError: true,
          };
        }

        const response: Record<string, unknown> = {
          id: concept.id,
          name: concept.name,
          category: concept.category,
          methodology: concept.methodology,
          definition: concept.definition,
        };

        if (concept.whenToUse) response.whenToUse = concept.whenToUse;
        if (concept.relatedArtifacts?.length) response.relatedArtifacts = concept.relatedArtifacts;
        if (concept.relatedTools?.length) response.relatedTools = concept.relatedTools;
        if (concept.relatedPersonas?.length) response.relatedPersonas = concept.relatedPersonas;
        if (concept.relatedConcepts?.length) response.relatedConcepts = concept.relatedConcepts;
        response.source = concept.source;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),
  ];
}
