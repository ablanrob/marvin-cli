import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { DocumentStore } from "../storage/store.js";
import type { SkillAction } from "./types.js";
import { createMarvinMcpServer } from "../agent/mcp-server.js";

export interface ActionRunnerContext {
  store: DocumentStore;
  marvinDir: string;
  projectRoot: string;
}

const GOVERNANCE_TOOL_NAMES = [
  "mcp__marvin-governance__list_decisions",
  "mcp__marvin-governance__get_decision",
  "mcp__marvin-governance__create_decision",
  "mcp__marvin-governance__update_decision",
  "mcp__marvin-governance__list_actions",
  "mcp__marvin-governance__get_action",
  "mcp__marvin-governance__create_action",
  "mcp__marvin-governance__update_action",
  "mcp__marvin-governance__list_questions",
  "mcp__marvin-governance__get_question",
  "mcp__marvin-governance__create_question",
  "mcp__marvin-governance__update_question",
  "mcp__marvin-governance__search_documents",
  "mcp__marvin-governance__read_document",
  "mcp__marvin-governance__project_summary",
];

export async function runSkillAction(
  action: SkillAction,
  userPrompt: string,
  context: ActionRunnerContext,
): Promise<CallToolResult> {
  try {
    const mcpServer = createMarvinMcpServer(context.store);
    const allowedTools =
      action.allowGovernanceTools !== false ? GOVERNANCE_TOOL_NAMES : [];

    const conversation = query({
      prompt: userPrompt,
      options: {
        systemPrompt: action.systemPrompt,
        mcpServers: { "marvin-governance": mcpServer },
        maxTurns: action.maxTurns ?? 5,
        allowedTools,
        cwd: context.projectRoot,
        tools: [],
        permissionMode: "acceptEdits",
      },
    });

    const textParts: string[] = [];
    for await (const message of conversation as AsyncIterable<SDKMessage>) {
      if (message.type === "assistant") {
        const textBlocks = message.message.content.filter(
          (b: { type: string }): b is { type: "text"; text: string } =>
            b.type === "text",
        );
        for (const block of textBlocks) {
          textParts.push(block.text);
        }
      }
    }

    return {
      content: [{ type: "text", text: textParts.join("\n") || "Action completed with no output." }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Skill action failed: ${err}` }],
      isError: true,
    };
  }
}
