import chalk from "chalk";
import ora from "ora";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { DocumentStore } from "../storage/store.js";
import { createMarvinMcpServer } from "../agent/mcp-server.js";
import { getPersona, resolvePersonaId } from "../personas/registry.js";
import { getConfig } from "../core/config.js";
import { resolvePlugin, getPluginTools } from "../plugins/registry.js";
import { buildAnalyzeSystemPrompt, buildAnalyzeUserPrompt } from "./prompts.js";
import type { AnalyzeOptions, AnalyzeResult } from "./types.js";

export async function analyzeMeeting(options: AnalyzeOptions): Promise<AnalyzeResult> {
  const { marvinDir, meetingId, draft, persona: personaInput } = options;

  const config = getConfig(marvinDir);
  const personaId = resolvePersonaId(personaInput);
  const persona = getPersona(personaId)!;

  const plugin = resolvePlugin(config.project.methodology);
  const registrations = plugin?.documentTypeRegistrations ?? [];
  const store = new DocumentStore(marvinDir, registrations);

  // Load and validate the meeting document
  const meetingDoc = store.get(meetingId);
  if (!meetingDoc) {
    throw new Error(`Meeting ${meetingId} not found`);
  }
  if (meetingDoc.frontmatter.type !== "meeting") {
    throw new Error(`Document ${meetingId} is not a meeting (type: ${meetingDoc.frontmatter.type})`);
  }

  // Track artifacts created in direct mode
  const createdArtifacts: string[] = [];

  // In direct mode, wrap store.create to inject source tag and track IDs
  if (!draft) {
    const originalCreate = store.create.bind(store);
    store.create = (type, frontmatter, content) => {
      const tags = frontmatter.tags ?? [];
      const sourceTag = `source:${meetingId}`;
      if (!tags.includes(sourceTag)) {
        tags.push(sourceTag);
      }
      const doc = originalCreate(type, { ...frontmatter, source: meetingId, tags }, content);
      createdArtifacts.push(doc.frontmatter.id);
      return doc;
    };
  }

  const pluginTools = plugin ? getPluginTools(plugin, store, marvinDir) : [];
  const mcpServer = createMarvinMcpServer(store, { pluginTools });
  const systemPrompt = buildAnalyzeSystemPrompt(persona, config.project, draft);
  const userPrompt = buildAnalyzeUserPrompt(
    meetingId,
    meetingDoc.content,
    meetingDoc.frontmatter.title,
    draft,
  );

  const spinner = ora({ text: `Analyzing meeting ${meetingId}...`, color: "cyan" });
  spinner.start();

  try {
    const conversation = query({
      prompt: userPrompt,
      options: {
        systemPrompt,
        mcpServers: { "marvin-governance": mcpServer },
        permissionMode: "acceptEdits",
        maxTurns: 10,
        tools: [],
        allowedTools: [
          "mcp__marvin-governance__create_decision",
          "mcp__marvin-governance__create_action",
          "mcp__marvin-governance__create_question",
          "mcp__marvin-governance__list_decisions",
          "mcp__marvin-governance__list_actions",
          "mcp__marvin-governance__list_questions",
        ],
      },
    });

    for await (const message of conversation) {
      handleAnalyzeMessage(message, spinner);
    }

    // In direct mode, update the meeting with an Outcomes section
    if (!draft && createdArtifacts.length > 0) {
      appendOutcomesToMeeting(store, meetingDoc.frontmatter.id, meetingDoc.content, createdArtifacts, store);
    }

    spinner.stop();

    if (draft) {
      console.log(chalk.dim(`\nDraft proposal complete. No artifacts were created.`));
      console.log(chalk.dim(`Use "marvin analyze ${meetingId} --no-draft" to create artifacts.`));
    } else {
      console.log(chalk.green(`\nCreated ${createdArtifacts.length} artifact${createdArtifacts.length === 1 ? "" : "s"} from meeting ${meetingId}`));
      if (createdArtifacts.length > 0) {
        console.log(chalk.dim(`  ${createdArtifacts.join(", ")}`));
      }
    }

    return { meetingId, artifacts: createdArtifacts, draft };
  } catch (err) {
    spinner.stop();
    throw err;
  }
}

function appendOutcomesToMeeting(
  store: DocumentStore,
  meetingId: string,
  existingContent: string,
  artifacts: string[],
  storeInstance: DocumentStore,
): void {
  // Build outcomes section from created artifact IDs
  const outcomeLines = artifacts.map((id) => {
    const doc = storeInstance.get(id);
    const title = doc ? doc.frontmatter.title : id;
    return `- ${id}: ${title}`;
  });

  const outcomesSection = `\n\n## Outcomes\n${outcomeLines.join("\n")}`;
  const updatedContent = existingContent + outcomesSection;

  store.update(meetingId, {}, updatedContent);
}

function handleAnalyzeMessage(
  message: SDKMessage,
  spinner: ReturnType<typeof ora>,
): void {
  switch (message.type) {
    case "assistant": {
      spinner.stop();
      const textBlocks = message.message.content.filter(
        (b: { type: string }): b is { type: "text"; text: string } =>
          b.type === "text",
      );
      if (textBlocks.length > 0) {
        console.log(
          chalk.cyan("\nMarvin: ") +
            textBlocks.map((b: { text: string }) => b.text).join("\n"),
        );
      }
      break;
    }
    case "system": {
      if (message.subtype === "init") {
        spinner.start("Analyzing...");
      }
      break;
    }
    case "result": {
      spinner.stop();
      if (message.subtype !== "success") {
        console.log(
          chalk.red(`\nAnalysis ended with error: ${message.subtype}`),
        );
      }
      break;
    }
  }
}
