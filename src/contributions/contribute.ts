import chalk from "chalk";
import ora from "ora";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { DocumentStore } from "../storage/store.js";
import { createMarvinMcpServer } from "../agent/mcp-server.js";
import { getPersona, resolvePersonaId } from "../personas/registry.js";
import { getConfig } from "../core/config.js";
import { resolvePlugin, getPluginTools } from "../plugins/registry.js";
import { buildContributeSystemPrompt, buildContributeUserPrompt } from "./prompts.js";
import type { ContributeOptions, ContributeResult } from "./types.js";

export async function contributeFromPersona(options: ContributeOptions): Promise<ContributeResult> {
  const { marvinDir, prompt, aboutArtifact, draft } = options;

  const config = getConfig(marvinDir);
  const personaId = resolvePersonaId(options.persona);
  const persona = getPersona(personaId)!;

  // Validate contribution type against persona's allowed types
  const allowedTypes = persona.contributionTypes ?? [];
  if (allowedTypes.length > 0 && !allowedTypes.includes(options.contributionType)) {
    throw new Error(
      `Contribution type "${options.contributionType}" is not valid for persona "${persona.name}". ` +
        `Allowed types: ${allowedTypes.join(", ")}`,
    );
  }

  const plugin = resolvePlugin(config.project.methodology);
  const registrations = plugin?.documentTypeRegistrations ?? [];
  const store = new DocumentStore(marvinDir, registrations);

  // Create the contribution document first (source record)
  const contributionFrontmatter: Record<string, unknown> = {
    title: `${options.contributionType}: ${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}`,
    status: "open",
    persona: personaId,
    contributionType: options.contributionType,
  };
  if (aboutArtifact) contributionFrontmatter.aboutArtifact = aboutArtifact;

  const contributionDoc = store.create("contribution", contributionFrontmatter as any, prompt);
  const contributionId = contributionDoc.frontmatter.id;

  // Track effects (created + updated artifact IDs)
  const createdArtifacts: string[] = [];
  const updatedArtifacts: string[] = [];

  // In direct mode, wrap store.create and store.update to inject source tags and track IDs
  if (!draft) {
    const originalCreate = store.create.bind(store);
    store.create = (type, frontmatter, content) => {
      // Don't tag contribution documents themselves
      const tags = frontmatter.tags ?? [];
      const sourceTag = `source:${contributionId}`;
      if (!tags.includes(sourceTag)) {
        tags.push(sourceTag);
      }
      const doc = originalCreate(type, { ...frontmatter, source: contributionId, tags }, content);
      createdArtifacts.push(doc.frontmatter.id);
      return doc;
    };

    const originalUpdate = store.update.bind(store);
    store.update = (id, updates, content) => {
      // Skip tagging the contribution document itself
      if (id === contributionId) {
        return originalUpdate(id, updates, content);
      }
      // Add source tag to existing tags
      const existing = store.get(id);
      const existingTags: string[] = existing?.frontmatter.tags ?? [];
      const sourceTag = `source:${contributionId}`;
      if (!existingTags.includes(sourceTag)) {
        existingTags.push(sourceTag);
      }
      const doc = originalUpdate(id, { ...updates, tags: existingTags }, content);
      if (!updatedArtifacts.includes(id)) {
        updatedArtifacts.push(id);
      }
      return doc;
    };
  }

  const pluginTools = plugin ? getPluginTools(plugin, store, marvinDir) : [];
  const mcpServer = createMarvinMcpServer(store, { pluginTools });
  const systemPrompt = buildContributeSystemPrompt(
    persona,
    options.contributionType,
    config.project,
    draft,
  );
  const userPrompt = buildContributeUserPrompt(
    contributionId,
    options.contributionType,
    prompt,
    aboutArtifact,
    draft,
  );

  const spinner = ora({ text: `Processing contribution ${contributionId}...`, color: "cyan" });
  spinner.start();

  try {
    const allowedTools = draft
      ? [
          "mcp__marvin-governance__list_decisions",
          "mcp__marvin-governance__list_actions",
          "mcp__marvin-governance__list_questions",
          "mcp__marvin-governance__get_decision",
          "mcp__marvin-governance__get_action",
          "mcp__marvin-governance__get_question",
        ]
      : [
          "mcp__marvin-governance__create_decision",
          "mcp__marvin-governance__create_action",
          "mcp__marvin-governance__create_question",
          "mcp__marvin-governance__update_decision",
          "mcp__marvin-governance__update_action",
          "mcp__marvin-governance__update_question",
          "mcp__marvin-governance__list_decisions",
          "mcp__marvin-governance__list_actions",
          "mcp__marvin-governance__list_questions",
          "mcp__marvin-governance__get_decision",
          "mcp__marvin-governance__get_action",
          "mcp__marvin-governance__get_question",
        ];

    const conversation = query({
      prompt: userPrompt,
      options: {
        systemPrompt,
        mcpServers: { "marvin-governance": mcpServer },
        permissionMode: "acceptEdits",
        maxTurns: 10,
        tools: [],
        allowedTools,
      },
    });

    for await (const message of conversation) {
      handleContributeMessage(message, spinner);
    }

    // Post-processing: append Effects section to contribution document
    const effects = [...createdArtifacts, ...updatedArtifacts];
    if (!draft && effects.length > 0) {
      appendEffectsToContribution(
        store,
        contributionId,
        contributionDoc.content,
        createdArtifacts,
        updatedArtifacts,
        store,
      );
    }

    spinner.stop();

    if (draft) {
      console.log(chalk.dim(`\nDraft proposal complete. No artifacts were created or updated.`));
      console.log(chalk.dim(`Use --no-draft to execute effects directly.`));
    } else {
      const totalEffects = createdArtifacts.length + updatedArtifacts.length;
      console.log(
        chalk.green(
          `\nContribution ${contributionId} processed: ${totalEffects} effect${totalEffects === 1 ? "" : "s"}`,
        ),
      );
      if (createdArtifacts.length > 0) {
        console.log(chalk.dim(`  Created: ${createdArtifacts.join(", ")}`));
      }
      if (updatedArtifacts.length > 0) {
        console.log(chalk.dim(`  Updated: ${updatedArtifacts.join(", ")}`));
      }
    }

    return { contributionId, effects, draft };
  } catch (err) {
    spinner.stop();
    throw err;
  }
}

function appendEffectsToContribution(
  store: DocumentStore,
  contributionId: string,
  existingContent: string,
  created: string[],
  updated: string[],
  storeInstance: DocumentStore,
): void {
  const lines: string[] = [];

  if (created.length > 0) {
    lines.push("### Created");
    for (const id of created) {
      const doc = storeInstance.get(id);
      const title = doc ? doc.frontmatter.title : id;
      lines.push(`- ${id}: ${title}`);
    }
  }

  if (updated.length > 0) {
    lines.push("### Updated");
    for (const id of updated) {
      const doc = storeInstance.get(id);
      const title = doc ? doc.frontmatter.title : id;
      lines.push(`- ${id}: ${title}`);
    }
  }

  const effectsSection = `\n\n## Effects\n${lines.join("\n")}`;
  const updatedContent = existingContent + effectsSection;

  store.update(contributionId, { status: "processed" }, updatedContent);
}

function handleContributeMessage(message: SDKMessage, spinner: ReturnType<typeof ora>): void {
  switch (message.type) {
    case "assistant": {
      spinner.stop();
      const textBlocks = message.message.content.filter(
        (b: { type: string }): b is { type: "text"; text: string } => b.type === "text",
      );
      if (textBlocks.length > 0) {
        console.log(
          chalk.cyan("\nMarvin: ") + textBlocks.map((b: { text: string }) => b.text).join("\n"),
        );
      }
      break;
    }
    case "system": {
      if (message.subtype === "init") {
        spinner.start("Analyzing contribution...");
      }
      break;
    }
    case "result": {
      spinner.stop();
      if (message.subtype !== "success") {
        console.log(chalk.red(`\nContribution analysis ended with error: ${message.subtype}`));
      }
      break;
    }
  }
}
