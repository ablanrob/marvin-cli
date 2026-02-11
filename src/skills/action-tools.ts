import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { SkillDefinition } from "./types.js";
import { runSkillAction, type ActionRunnerContext } from "./action-runner.js";

export function createSkillActionTools(
  skills: SkillDefinition[],
  context: ActionRunnerContext,
): SdkMcpToolDefinition<any>[] {
  const tools: SdkMcpToolDefinition<any>[] = [];

  for (const skill of skills) {
    if (!skill.actions) continue;
    for (const action of skill.actions) {
      tools.push(
        tool(
          `${skill.id}__${action.id}`,
          action.description,
          {
            prompt: z.string().describe("What you want this action to do"),
          },
          async (args) => runSkillAction(action, args.prompt, context),
        ),
      );
    }
  }

  return tools;
}
