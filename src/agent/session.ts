import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import chalk from "chalk";
import ora from "ora";
import {
  query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { PersonaDefinition } from "../personas/types.js";
import type { MergedConfig } from "../core/config.js";
import { buildSystemPrompt } from "../personas/prompt-builder.js";
import { DocumentStore } from "../storage/store.js";
import { SessionStore, type SessionEntry } from "../storage/session-store.js";
import { createMarvinMcpServer } from "./mcp-server.js";
import { generateSessionName } from "./session-namer.js";
import { SourceManifestManager } from "../sources/manifest.js";
import { resolvePlugin, getPluginTools, getPluginPromptFragment } from "../plugins/registry.js";
import { loadAllSkills, resolveSkillsForPersona, getSkillTools, getSkillPromptFragment } from "../skills/registry.js";
import { createSkillActionTools } from "../skills/action-tools.js";

export interface SessionOptions {
  persona: PersonaDefinition;
  config: MergedConfig;
  marvinDir: string;
  projectRoot: string;
  initialPrompt?: string;
  sessionName?: string;
}

export async function startSession(options: SessionOptions): Promise<void> {
  const { persona, config, marvinDir, projectRoot } = options;
  const plugin = resolvePlugin(config.project.methodology);
  const registrations = plugin?.documentTypeRegistrations ?? [];
  const store = new DocumentStore(marvinDir, registrations);
  const sessionStore = new SessionStore(marvinDir);
  const sourcesDir = path.join(marvinDir, "sources");
  const hasSourcesDir = fs.existsSync(sourcesDir);
  const manifest = hasSourcesDir ? new SourceManifestManager(marvinDir) : undefined;

  const pluginTools = plugin ? getPluginTools(plugin, store, marvinDir) : [];
  const pluginPromptFragment = plugin ? getPluginPromptFragment(plugin, persona.id) : undefined;

  const allSkills = loadAllSkills(marvinDir);
  const skillIds = resolveSkillsForPersona(persona.id, config.project.skills, allSkills);
  const codeSkillTools = getSkillTools(skillIds, allSkills, store);
  const skillsWithActions = skillIds
    .map((id) => allSkills.get(id)!)
    .filter((s) => s.actions && s.actions.length > 0);
  const actionTools = createSkillActionTools(skillsWithActions, { store, marvinDir, projectRoot });
  const skillPromptFragment = getSkillPromptFragment(skillIds, allSkills, persona.id);

  const mcpServer = createMarvinMcpServer(store, {
    manifest,
    sourcesDir: hasSourcesDir ? sourcesDir : undefined,
    sessionStore,
    pluginTools,
    skillTools: [...codeSkillTools, ...actionTools],
  });
  const systemPrompt = buildSystemPrompt(persona, config.project, pluginPromptFragment, skillPromptFragment);

  // Resolve resume session
  let existingSession: SessionEntry | undefined;
  if (options.sessionName) {
    existingSession = sessionStore.get(options.sessionName);
    if (!existingSession) {
      console.log(chalk.red(`Session "${options.sessionName}" not found.`));
      process.exit(1);
    }
    console.log(chalk.dim(`Resuming session "${existingSession.name}"...\n`));
  }

  console.log(
    chalk.bold(`\nMarvin — ${persona.name}\n`),
  );
  console.log(
    chalk.dim(`Project: ${config.project.name} | Type "exit" to end\n`),
  );

  // Track turns for session naming
  const turns: Array<{ role: string; content: string }> = [];
  let sessionId: string | undefined;

  // Create an async generator that yields user messages
  async function* userMessages(
    firstPrompt: string,
  ): AsyncGenerator<SDKUserMessage, void> {
    // Yield the first prompt
    yield {
      type: "user",
      message: { role: "user", content: firstPrompt },
      parent_tool_use_id: null,
      session_id: "",
    };
    turns.push({ role: "user", content: firstPrompt });

    // Interactive loop
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      while (true) {
        const input = await new Promise<string>((resolve) => {
          rl.question(chalk.green("\nYou: "), resolve);
        });

        const trimmed = input.trim();
        if (trimmed === "exit" || trimmed === "quit") {
          break;
        }
        if (!trimmed) continue;

        turns.push({ role: "user", content: trimmed });

        yield {
          type: "user",
          message: { role: "user", content: trimmed },
          parent_tool_use_id: null,
          session_id: "",
        };
      }
    } finally {
      rl.close();
    }
  }

  const firstPrompt =
    options.initialPrompt ??
    `Hello! I'm ready to help with the "${config.project.name}" project. What would you like to work on?`;

  const prompt = options.initialPrompt
    ? firstPrompt
    : userMessages(firstPrompt);

  const spinner = ora({ text: "Thinking...", color: "cyan" });

  const queryOptions: Record<string, unknown> = {
    systemPrompt: systemPrompt,
    mcpServers: { "marvin-governance": mcpServer },
    permissionMode: "acceptEdits",
    maxTurns: 50,
    cwd: projectRoot,
    tools: [],
    allowedTools: [
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
      "mcp__marvin-governance__list_sources",
      "mcp__marvin-governance__get_source_info",
      "mcp__marvin-governance__list_sessions",
      "mcp__marvin-governance__get_session",
      "mcp__marvin-governance__analyze_meeting",
      ...pluginTools.map((t) => `mcp__marvin-governance__${t.name}`),
      ...codeSkillTools.map((t) => `mcp__marvin-governance__${t.name}`),
      ...actionTools.map((t) => `mcp__marvin-governance__${t.name}`),
    ],
  };

  if (existingSession) {
    queryOptions.resume = existingSession.id;
  }

  const conversation = query({
    prompt,
    options: queryOptions,
  });

  try {
    for await (const message of conversation) {
      // Capture session ID from first message
      if (!sessionId && "session_id" in message && message.session_id) {
        sessionId = message.session_id as string;
      }

      // Track assistant turns
      if (message.type === "assistant") {
        const textBlocks = message.message.content.filter(
          (b: { type: string }): b is { type: "text"; text: string } => b.type === "text",
        );
        const text = textBlocks.map((b: { text: string }) => b.text).join("\n");
        if (text) {
          turns.push({ role: "assistant", content: text });
        }
      }

      handleMessage(message, spinner);
    }
  } finally {
    spinner.stop();

    // Auto-save session
    if (sessionId && turns.length > 0) {
      try {
        const userTurnCount = turns.filter((t) => t.role === "user").length;

        if (existingSession) {
          sessionStore.updateLastUsed(existingSession.name, userTurnCount);
          console.log(chalk.dim(`\nSession "${existingSession.name}" updated.\n`));
        } else {
          const name = await generateSessionName(turns);
          const now = new Date().toISOString();
          sessionStore.save({
            id: sessionId,
            name,
            persona: persona.id,
            created: now,
            lastUsed: now,
            turnCount: userTurnCount,
          });
          console.log(chalk.dim(`\nSession saved as "${name}"\n`));
        }
      } catch {
        console.log(chalk.dim("\nSession ended.\n"));
      }
    } else {
      console.log(chalk.dim("\nSession ended.\n"));
    }
  }
}

function handleMessage(message: SDKMessage, spinner: ReturnType<typeof ora>): void {
  switch (message.type) {
    case "assistant": {
      spinner.stop();
      const textBlocks = message.message.content.filter(
        (b: { type: string }): b is { type: "text"; text: string } => b.type === "text",
      );
      if (textBlocks.length > 0) {
        console.log(chalk.cyan("\nMarvin: ") + textBlocks.map((b: { text: string }) => b.text).join("\n"));
      }
      break;
    }
    case "system": {
      if (message.subtype === "init") {
        spinner.start("Thinking...");
      }
      break;
    }
    case "result": {
      spinner.stop();
      if (message.subtype !== "success") {
        console.log(chalk.red(`\nSession ended with error: ${message.subtype}`));
      }
      break;
    }
  }
}
