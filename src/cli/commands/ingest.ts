import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { loadProject } from "../../core/project.js";
import { SourceManifestManager } from "../../sources/manifest.js";
import { ingestFile } from "../../sources/ingest.js";

export interface IngestCommandOptions {
  all?: boolean;
  draft?: boolean;
  as?: string;
}

export async function ingestCommand(
  file: string | undefined,
  options: IngestCommandOptions,
): Promise<void> {
  const project = loadProject();
  const marvinDir = project.marvinDir;
  const sourcesDir = path.join(marvinDir, "sources");

  if (!fs.existsSync(sourcesDir)) {
    fs.mkdirSync(sourcesDir, { recursive: true });
  }

  const manifest = new SourceManifestManager(marvinDir);
  manifest.scan();

  const isDraft = options.draft !== false; // default true
  const persona = options.as ?? "product-owner";

  // No args, no --all: show status
  if (!file && !options.all) {
    showSourceStatus(manifest);
    return;
  }

  // Process specific file
  if (file) {
    const filePath = path.join(sourcesDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(chalk.red(`Source file not found: ${file}`));
      console.log(chalk.dim(`Expected at: ${filePath}`));
      console.log(chalk.dim(`Drop files into .marvin/sources/ and try again.`));
      return;
    }

    // Ensure it's tracked in manifest
    if (!manifest.get(file)) {
      manifest.scan();
    }

    await ingestFile({ marvinDir, fileName: file, draft: isDraft, persona });
    return;
  }

  // --all: process all unprocessed files
  const unprocessed = manifest.unprocessed();
  if (unprocessed.length === 0) {
    console.log(chalk.green("All source files have been processed."));
    showSourceStatus(manifest);
    return;
  }

  console.log(chalk.bold(`\nProcessing ${unprocessed.length} source file${unprocessed.length === 1 ? "" : "s"}...\n`));

  for (const fileName of unprocessed) {
    try {
      await ingestFile({ marvinDir, fileName, draft: isDraft, persona });
    } catch (err) {
      console.log(chalk.red(`\nError processing ${fileName}: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
}

function showSourceStatus(manifest: SourceManifestManager): void {
  const all = manifest.list();

  if (all.length === 0) {
    console.log(chalk.dim("\nNo source files found in .marvin/sources/"));
    console.log(chalk.dim("Drop PDF, Markdown, or text files there and run \"marvin ingest --all\".\n"));
    return;
  }

  console.log(chalk.bold("\nSource Files:\n"));

  const statusColors: Record<string, (s: string) => string> = {
    pending: chalk.yellow,
    processing: chalk.blue,
    completed: chalk.green,
    error: chalk.red,
  };

  for (const { name, entry } of all) {
    const colorFn = statusColors[entry.status] ?? chalk.white;
    const status = colorFn(entry.status.padEnd(10));
    const artifacts = entry.artifacts.length > 0
      ? chalk.dim(` → ${entry.artifacts.join(", ")}`)
      : "";
    const error = entry.error ? chalk.red(` (${entry.error})`) : "";
    console.log(`  ${status} ${name}${artifacts}${error}`);
  }

  const pending = all.filter((f) => f.entry.status === "pending" || f.entry.status === "error").length;
  if (pending > 0) {
    console.log(chalk.dim(`\n${pending} file${pending === 1 ? "" : "s"} ready to process. Run "marvin ingest --all" to process them.\n`));
  } else {
    console.log("");
  }
}
