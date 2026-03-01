import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { PersonaContextManager } from "./persona-context.js";
import {
  buildMcpGuidance,
  buildPersonaSummaries,
} from "./persona-context.js";
import { getPersona } from "../personas/registry.js";

/**
 * Create the persona management tools for the standalone MCP server.
 */
export function createPersonaTools(
  ctx: PersonaContextManager,
  marvinDir: string,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "set_persona",
      "Set the active persona for this session. Returns full guidance for the selected persona including behavioral rules, allowed document types, and scope. Call this before working to ensure persona-appropriate behavior.",
      {
        persona: z
          .string()
          .describe(
            'Persona ID or short name (e.g. "po", "product-owner", "dm", "delivery-manager", "tl", "tech-lead")',
          ),
      },
      async (args) => {
        const resolved = ctx.setPersona(args.persona);
        if (!resolved) {
          const summaries = buildPersonaSummaries();
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown persona "${args.persona}".\n\n${summaries}`,
              },
            ],
            isError: true,
          };
        }
        const guidance = buildMcpGuidance(resolved, marvinDir);
        return {
          content: [{ type: "text" as const, text: guidance }],
        };
      },
    ),

    tool(
      "get_persona_guidance",
      "Get guidance for a persona without changing the active persona. If no persona is specified, lists all available personas with summaries.",
      {
        persona: z
          .string()
          .optional()
          .describe(
            'Optional persona ID or short name. Omit to list all personas.',
          ),
      },
      async (args) => {
        if (!args.persona) {
          const summaries = buildPersonaSummaries();
          return {
            content: [{ type: "text" as const, text: summaries }],
          };
        }

        const resolved = getPersona(args.persona);
        if (!resolved) {
          const summaries = buildPersonaSummaries();
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown persona "${args.persona}".\n\n${summaries}`,
              },
            ],
            isError: true,
          };
        }

        const guidance = buildMcpGuidance(resolved, marvinDir);
        return {
          content: [{ type: "text" as const, text: guidance }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),
  ];
}
