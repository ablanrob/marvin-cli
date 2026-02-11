import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { SessionStore } from "../../storage/session-store.js";

export function createSessionTools(
  store: SessionStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_sessions",
      "List all saved chat sessions, sorted by most recently used",
      {
        persona: z.string().optional().describe("Filter by persona ID (e.g. 'product-owner')"),
      },
      async (args) => {
        let sessions = store.list();
        if (args.persona) {
          sessions = sessions.filter((s) => s.persona === args.persona);
        }
        const summary = sessions.map((s) => ({
          name: s.name,
          persona: s.persona,
          created: s.created,
          lastUsed: s.lastUsed,
          turnCount: s.turnCount,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_session",
      "Get details of a specific saved session by name",
      { name: z.string().describe("Session name (e.g. 'jwt-auth-decision')") },
      async (args) => {
        const session = store.get(args.name);
        if (!session) {
          return {
            content: [{ type: "text" as const, text: `Session "${args.name}" not found` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(session, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),
  ];
}
