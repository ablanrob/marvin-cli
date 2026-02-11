import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { loadProject } from "../../core/project.js";
import { ImportError } from "../../core/errors.js";
import { DocumentStore } from "../../storage/store.js";
import { SourceManifestManager } from "../../sources/manifest.js";
import { ingestFile } from "../../sources/ingest.js";
import { buildImportPlan, executeImportPlan, formatPlanSummary } from "../../import/engine.js";
import type { ConflictStrategy, ImportOptions } from "../../import/types.js";

export interface ImportCommandOptions {
  dryRun?: boolean;
  conflict?: string;
  tag?: string;
  ingest?: boolean;
  as?: string;
  draft?: boolean;
}

export async function importCommand(
  inputPath: string,
  options: ImportCommandOptions,
): Promise<void> {
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) {
    throw new ImportError(`Path not found: ${resolved}`);
  }

  const project = loadProject();
  const { marvinDir } = project;
  const store = new DocumentStore(marvinDir);

  const importOptions: ImportOptions = {
    dryRun: options.dryRun ?? false,
    conflict: (options.conflict as ConflictStrategy) ?? "renumber",
    tag: options.tag,
    ingest: options.ingest ?? false,
    as: options.as ?? "product-owner",
    draft: options.draft !== false,
  };

  const plan = buildImportPlan(resolved, store, marvinDir, importOptions);

  console.log(chalk.bold("\nImport Plan:\n"));
  console.log(formatPlanSummary(plan));
  console.log("");

  if (importOptions.dryRun) {
    console.log(chalk.yellow("Dry run — no changes made."));
    return;
  }

  if (plan.items.length === 0) {
    console.log(chalk.dim("Nothing to import."));
    return;
  }

  const result = executeImportPlan(plan, store, marvinDir, importOptions);

  if (result.imported > 0) {
    console.log(
      chalk.green(
        `Imported ${result.imported} document${result.imported === 1 ? "" : "s"}`,
      ),
    );
  }
  if (result.copied > 0) {
    console.log(
      chalk.green(
        `Copied ${result.copied} file${result.copied === 1 ? "" : "s"} to sources/`,
      ),
    );
  }
  if (result.skipped > 0) {
    console.log(
      chalk.yellow(
        `Skipped ${result.skipped} item${result.skipped === 1 ? "" : "s"} (conflicts)`,
      ),
    );
  }

  // If raw sources were copied and --ingest is set, trigger ingest
  if (importOptions.ingest && result.copied > 0) {
    console.log(chalk.bold("\nStarting ingest of copied sources...\n"));
    const manifest = new SourceManifestManager(marvinDir);
    manifest.scan();

    const copiedFileNames = result.items
      .filter((i) => i.action === "copy")
      .map((i) => path.basename(i.targetPath));

    for (const fileName of copiedFileNames) {
      try {
        await ingestFile({
          marvinDir,
          fileName,
          draft: importOptions.draft,
          persona: importOptions.as,
        });
      } catch (err) {
        console.log(
          chalk.red(
            `Error ingesting ${fileName}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    }
  }
}
