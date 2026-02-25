import * as http from "node:http";
import { exec } from "node:child_process";
import { loadProject } from "../core/project.js";
import { resolvePlugin } from "../plugins/registry.js";
import {
  loadAllSkills,
  collectSkillRegistrations,
} from "../skills/registry.js";
import { DocumentStore } from "../storage/store.js";
import { handleRequest } from "./router.js";

export interface WebServerOptions {
  port: number;
  open: boolean;
}

export async function startWebServer(opts: WebServerOptions): Promise<void> {
  const project = loadProject();
  const plugin = resolvePlugin(project.config.methodology);
  const pluginRegs = plugin?.documentTypeRegistrations ?? [];

  const allSkills = loadAllSkills(project.marvinDir);
  const allSkillIds = [...allSkills.keys()];
  const skillRegs = collectSkillRegistrations(allSkillIds, allSkills);

  const store = new DocumentStore(project.marvinDir, [
    ...pluginRegs,
    ...skillRegs,
  ]);
  const projectName = project.config.name;

  const server = http.createServer((req, res) => {
    handleRequest(req, res, store, projectName);
  });

  server.listen(opts.port, () => {
    const url = `http://localhost:${opts.port}`;
    console.log(`\n  Marvin dashboard running at ${url}\n`);
    console.log("  Press Ctrl+C to stop.\n");

    if (opts.open) {
      openBrowser(url);
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n  Shutting down...\n");
    server.close(() => process.exit(0));
    // Force exit after 2s if connections linger
    setTimeout(() => process.exit(0), 2000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) {
      // Non-critical: user can open the URL manually
    }
  });
}
