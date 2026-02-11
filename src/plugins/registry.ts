import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../storage/store.js";
import type { MarvinPlugin } from "./types.js";
import { genericAgilePlugin } from "./builtin/generic-agile.js";
import { sapAemPlugin } from "./builtin/sap-aem.js";

const BUILTIN_PLUGINS: Record<string, MarvinPlugin> = {
  "generic-agile": genericAgilePlugin,
  "sap-aem": sapAemPlugin,
};

export function resolvePlugin(methodologyId?: string): MarvinPlugin | undefined {
  if (!methodologyId) return undefined;
  return BUILTIN_PLUGINS[methodologyId];
}

export function getPluginTools(
  plugin: MarvinPlugin,
  store: DocumentStore,
  marvinDir?: string,
): SdkMcpToolDefinition<any>[] {
  return plugin.tools ? plugin.tools(store, marvinDir) : [];
}

export function getPluginPromptFragment(
  plugin: MarvinPlugin,
  personaId: string,
): string | undefined {
  if (!plugin.promptFragments) return undefined;
  return plugin.promptFragments[personaId] ?? plugin.promptFragments["*"];
}
