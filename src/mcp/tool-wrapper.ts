import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { PersonaContextManager } from "./persona-context.js";
import { buildPersonaSummaries } from "./persona-context.js";

/**
 * Extract the document type from a tool name like "create_decision" or "update_epic".
 * Returns undefined for tool names that don't match the create_/update_ pattern
 * or for the special "save_report" case.
 */
function extractDocType(toolName: string): string | undefined {
  if (toolName === "save_report") return "report";

  const match = toolName.match(/^(?:create|update)_(\w+)$/);
  return match ? match[1].replace(/_/g, "-") : undefined;
}

/**
 * Wrap governance tools with persona validation.
 *
 * Write operations (create_*, update_*) are blocked until a persona is set
 * via set_persona. Once a persona is active, out-of-scope document types
 * produce an advisory warning but still execute.
 *
 * Read-only tools pass through unchanged.
 */
export function wrapToolsWithPersonaValidation(
  tools: SdkMcpToolDefinition<any>[],
  ctx: PersonaContextManager,
): SdkMcpToolDefinition<any>[] {
  return tools.map((t) => {
    const docType = extractDocType(t.name);
    if (!docType) return t;

    return {
      ...t,
      handler: async (args: Record<string, unknown>, extra: unknown) => {
        const persona = ctx.getActivePersona();

        if (!persona) {
          const summaries = buildPersonaSummaries();
          return {
            content: [
              {
                type: "text" as const,
                text: `[PERSONA REQUIRED] You must set an active persona before creating or updating documents. Call the set_persona tool first.\n\n${summaries}`,
              },
            ],
            isError: true,
          };
        }

        const result = await t.handler(args, extra);

        if (ctx.isDocumentTypeAllowed(docType)) {
          return result;
        }

        // Prepend warning to the first text content block
        const warning = [
          `[PERSONA WARNING] You are acting as ${persona.name} (${persona.shortName}). Creating/updating "${docType}" documents is outside your typical scope.`,
          "",
          `Your allowed document types: ${persona.documentTypes.join(", ")}`,
          "",
          "Consider whether this is the right persona for this task, or switch with set_persona.",
          "",
          "---",
        ].join("\n");

        const content = Array.isArray(result.content)
          ? result.content.map((block: { type: string; text?: string }, index: number) => {
              if (index === 0 && block.type === "text" && block.text) {
                return { ...block, text: `${warning}\n${block.text}` };
              }
              return block;
            })
          : result.content;

        return { ...result, content };
      },
    };
  }) as SdkMcpToolDefinition<any>[];
}
