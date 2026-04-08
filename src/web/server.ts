import * as http from "node:http";
import { exec } from "node:child_process";
import { loadProject } from "../core/project.js";
import { resolvePlugin } from "../plugins/registry.js";
import { COMMON_REGISTRATIONS } from "../plugins/common.js";
import { loadAllSkills, collectSkillRegistrations } from "../skills/registry.js";
import { DocumentStore } from "../storage/store.js";
import { CORE_DOCUMENT_TYPES } from "../storage/types.js";
import { handleRequest } from "./router.js";
import type { NavGroup } from "./templates/layout.js";

export interface WebServerOptions {
  port: number;
  open: boolean;
}

export interface BuildNavGroupsInput {
  pluginRegs: Array<{ type: string }>;
  skillRegs: Array<{ type: string }>;
  pluginName?: string;
}

export function buildNavGroups(input: BuildNavGroupsInput): NavGroup[] {
  const commonTypes = new Set(COMMON_REGISTRATIONS.map((r) => r.type));
  const pluginOnlyTypes = input.pluginRegs.map((r) => r.type).filter((t) => !commonTypes.has(t));
  const skillTypes = input.skillRegs.map((r) => r.type);

  const navGroups: NavGroup[] = [
    { label: "Governance", types: [...CORE_DOCUMENT_TYPES] },
    { label: "Project", types: [...commonTypes] },
  ];
  if (pluginOnlyTypes.length > 0) {
    navGroups.push({
      label: input.pluginName ?? "Plugin",
      types: pluginOnlyTypes,
    });
  }
  if (skillTypes.length > 0) {
    navGroups.push({ label: "Skills", types: skillTypes });
  }

  return navGroups;
}

export async function startWebServer(opts: WebServerOptions): Promise<void> {
  const project = loadProject();
  const plugin = resolvePlugin(project.config.methodology);
  const pluginRegs = plugin?.documentTypeRegistrations ?? [];

  const allSkills = loadAllSkills(project.marvinDir);
  const allSkillIds = [...allSkills.keys()];
  const skillRegs = collectSkillRegistrations(allSkillIds, allSkills);

  const store = new DocumentStore(project.marvinDir, [...pluginRegs, ...skillRegs]);
  const projectName = project.config.name;

  const navGroups = buildNavGroups({
    pluginRegs,
    skillRegs,
    pluginName: plugin?.name,
  });

  const server = http.createServer((req, res) => {
    handleRequest(req, res, store, projectName, navGroups);
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

export function openBrowser(url: string): void {
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
