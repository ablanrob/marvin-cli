import * as fs from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import { DocumentStore } from "../storage/store.js";
import { loadProjectConfig } from "../core/config.js";
import { SourceManifestManager } from "../sources/manifest.js";
import { createDecisionTools } from "../agent/tools/decisions.js";
import { createActionTools } from "../agent/tools/actions.js";
import { createQuestionTools } from "../agent/tools/questions.js";
import { createDocumentTools } from "../agent/tools/documents.js";
import { createSourceTools } from "../agent/tools/sources.js";
import { createSessionTools } from "../agent/tools/sessions.js";
import { SessionStore } from "../storage/session-store.js";
import { resolvePlugin, getPluginTools } from "../plugins/registry.js";
import { loadAllSkills, getSkillTools, collectSkillRegistrations } from "../skills/registry.js";
import { createSkillActionTools } from "../skills/action-tools.js";
import { createWebTools } from "../agent/tools/web.js";
import { createDoctorTools } from "../agent/tools/doctor.js";
import { buildNavGroups } from "../web/server.js";
import { PersonaContextManager } from "./persona-context.js";
import { createPersonaTools } from "./persona-tools.js";
import { wrapToolsWithPersonaValidation } from "./tool-wrapper.js";

export interface StdioServerOptions {
  marvinDir: string;
}

/**
 * Collect all governance tool definitions from the existing tool creators.
 * Reuses the same tool factories as the agent MCP server.
 */
export function collectTools(marvinDir: string): SdkMcpToolDefinition<any>[] {
  const config = loadProjectConfig(marvinDir);
  const plugin = resolvePlugin(config.methodology);
  const pluginRegistrations = plugin?.documentTypeRegistrations ?? [];

  const allSkills = loadAllSkills(marvinDir);
  const allSkillIds = [...allSkills.keys()];
  const allSkillRegs = collectSkillRegistrations(allSkillIds, allSkills);

  const store = new DocumentStore(marvinDir, [...pluginRegistrations, ...allSkillRegs]);
  const sourcesDir = path.join(marvinDir, "sources");
  const hasSourcesDir = fs.existsSync(sourcesDir);
  const manifest = hasSourcesDir ? new SourceManifestManager(marvinDir) : undefined;

  const pluginTools = plugin ? getPluginTools(plugin, store, marvinDir) : [];

  const sessionStore = new SessionStore(marvinDir);

  const codeSkillTools = getSkillTools(allSkillIds, allSkills, store, config);
  const skillsWithActions = allSkillIds
    .map((id) => allSkills.get(id)!)
    .filter((s) => s.actions && s.actions.length > 0);
  const projectRoot = path.dirname(marvinDir);
  const actionTools = createSkillActionTools(skillsWithActions, { store, marvinDir, projectRoot });
  const navGroups = buildNavGroups({
    pluginRegs: pluginRegistrations,
    skillRegs: allSkillRegs,
    pluginName: plugin?.name,
  });

  return [
    ...createDecisionTools(store),
    ...createActionTools(store),
    ...createQuestionTools(store),
    ...createDocumentTools(store),
    ...(manifest ? createSourceTools(manifest) : []),
    ...createSessionTools(sessionStore),
    ...createWebTools(store, config.name, navGroups),
    ...createDoctorTools(store, { config, manifest, marvinDir }),
    ...pluginTools,
    ...codeSkillTools,
    ...actionTools,
  ];
}

/**
 * Strip undefined values from an object so YAML serialization doesn't choke.
 * The MCP SDK sets optional fields to undefined, but the Agent SDK omits them.
 */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Register SdkMcpToolDefinition objects onto an McpServer instance.
 * The adapter is nearly 1:1 since both use Zod raw shapes and CallToolResult.
 */
export function registerSdkTools(server: McpServer, tools: SdkMcpToolDefinition<any>[]): void {
  for (const sdkTool of tools) {
    const hasInputSchema = Object.keys(sdkTool.inputSchema).length > 0;
    if (hasInputSchema) {
      server.tool(
        sdkTool.name,
        sdkTool.description,
        sdkTool.inputSchema,
        async (args: Record<string, unknown>) => sdkTool.handler(stripUndefined(args) as any, {}),
      );
    } else {
      server.tool(sdkTool.name, sdkTool.description, async () => sdkTool.handler({}, {}));
    }
  }
}

/**
 * Create an McpServer with all governance tools and connect it via stdio transport.
 */
export async function startStdioServer(options: StdioServerOptions): Promise<void> {
  const server = new McpServer(
    { name: "marvin-governance", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const contextManager = new PersonaContextManager();
  const governanceTools = collectTools(options.marvinDir);
  const personaTools = createPersonaTools(contextManager, options.marvinDir);
  const wrappedTools = wrapToolsWithPersonaValidation(governanceTools, contextManager);
  registerSdkTools(server, [...personaTools, ...wrappedTools]);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
