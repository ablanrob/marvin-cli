import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import ora from "ora";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { DocumentStore } from "../storage/store.js";
import { createMarvinMcpServer } from "../agent/mcp-server.js";
import { getPersona, resolvePersonaId } from "../personas/registry.js";
import { getConfig } from "../core/config.js";
import { SourceManifestManager } from "./manifest.js";
import { buildIngestSystemPrompt, buildIngestUserPrompt } from "./prompts.js";
import type { IngestOptions, IngestResult } from "./types.js";

export async function ingestFile(options: IngestOptions): Promise<IngestResult> {
  const { marvinDir, fileName, draft, persona: personaInput } = options;

  const config = getConfig(marvinDir);
  const personaId = resolvePersonaId(personaInput);
  const persona = getPersona(personaId)!;

  const manifest = new SourceManifestManager(marvinDir);
  const sourcesDir = manifest.sourcesDir;
  const filePath = path.join(sourcesDir, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Source file not found: ${filePath}`);
  }

  const ext = path.extname(fileName).toLowerCase();
  const isPdf = ext === ".pdf";

  // For text files, read content inline; for PDFs, let Claude use the Read tool
  let fileContent: string | null = null;
  if (!isPdf) {
    fileContent = fs.readFileSync(filePath, "utf-8");
  }

  const store = new DocumentStore(marvinDir);

  // Track artifacts created in direct mode
  const createdArtifacts: string[] = [];

  // In direct mode, wrap store.create to inject source field and track IDs
  if (!draft) {
    const originalCreate = store.create.bind(store);
    store.create = (type, frontmatter, content) => {
      const tags = frontmatter.tags ?? [];
      const sourceTag = `source:${fileName}`;
      if (!tags.includes(sourceTag)) {
        tags.push(sourceTag);
      }
      const doc = originalCreate(type, { ...frontmatter, source: fileName, tags }, content);
      createdArtifacts.push(doc.frontmatter.id);
      return doc;
    };
  }

  const mcpServer = createMarvinMcpServer(store, { manifest, sourcesDir });
  const systemPrompt = buildIngestSystemPrompt(persona, config.project, draft);
  const userPrompt = buildIngestUserPrompt(fileName, filePath, fileContent, draft);

  // Enable Read tool only for PDFs so Claude can read the file
  const tools: string[] = isPdf ? ["Read"] : [];

  manifest.markProcessing(fileName);
  const spinner = ora({ text: `Analyzing ${fileName}...`, color: "cyan" });
  spinner.start();

  try {
    const conversation = query({
      prompt: userPrompt,
      options: {
        systemPrompt,
        mcpServers: { "marvin-governance": mcpServer },
        permissionMode: "acceptEdits",
        maxTurns: 10,
        tools,
        allowedTools: [
          "mcp__marvin-governance__create_decision",
          "mcp__marvin-governance__create_action",
          "mcp__marvin-governance__create_question",
          "mcp__marvin-governance__list_sources",
          "mcp__marvin-governance__get_source_info",
        ],
      },
    });

    for await (const message of conversation) {
      handleIngestMessage(message, spinner);
    }

    manifest.markCompleted(fileName, createdArtifacts);
    spinner.stop();

    if (draft) {
      console.log(chalk.dim(`\nDraft proposal complete. No artifacts were created.`));
      console.log(chalk.dim(`Use "marvin ingest ${fileName} --no-draft" to create artifacts.`));
    } else {
      console.log(chalk.green(`\nCreated ${createdArtifacts.length} artifact${createdArtifacts.length === 1 ? "" : "s"} from ${fileName}`));
      if (createdArtifacts.length > 0) {
        console.log(chalk.dim(`  ${createdArtifacts.join(", ")}`));
      }
    }

    return { fileName, artifacts: createdArtifacts, draft };
  } catch (err) {
    spinner.stop();
    const errorMsg = err instanceof Error ? err.message : String(err);
    manifest.markError(fileName, errorMsg);
    throw err;
  }
}

function handleIngestMessage(
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
          chalk.red(`\nIngest ended with error: ${message.subtype}`),
        );
      }
      break;
    }
  }
}
