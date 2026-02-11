import * as path from "node:path";
import { findProjectRoot } from "../src/core/project.js";
import { startStdioServer } from "../src/mcp/stdio-server.js";

function parseProjectDir(argv: string[]): string | undefined {
  const idx = argv.indexOf("--project-dir");
  if (idx !== -1 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  const projectDir = parseProjectDir(process.argv);
  const from = projectDir ? path.resolve(projectDir) : process.cwd();
  const root = findProjectRoot(from);
  const marvinDir = path.join(root, ".marvin");
  await startStdioServer({ marvinDir });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
