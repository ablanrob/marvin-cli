import { loadProject } from "../../core/project.js";
import { startStdioServer } from "../../mcp/stdio-server.js";

export async function serveCommand(): Promise<void> {
  const project = loadProject();
  await startStdioServer({ marvinDir: project.marvinDir });
}
