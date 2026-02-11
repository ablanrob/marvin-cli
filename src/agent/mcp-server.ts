import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../storage/store.js";
import type { SessionStore } from "../storage/session-store.js";
import type { SourceManifestManager } from "../sources/manifest.js";
import { createDecisionTools } from "./tools/decisions.js";
import { createActionTools } from "./tools/actions.js";
import { createQuestionTools } from "./tools/questions.js";
import { createDocumentTools } from "./tools/documents.js";
import { createSourceTools } from "./tools/sources.js";
import { createSessionTools } from "./tools/sessions.js";

export interface McpServerOptions {
  manifest?: SourceManifestManager;
  sourcesDir?: string;
  sessionStore?: SessionStore;
  pluginTools?: SdkMcpToolDefinition<any>[];
  skillTools?: SdkMcpToolDefinition<any>[];
}

export function createMarvinMcpServer(
  store: DocumentStore,
  options?: McpServerOptions,
): McpSdkServerConfigWithInstance {
  const tools = [
    ...createDecisionTools(store),
    ...createActionTools(store),
    ...createQuestionTools(store),
    ...createDocumentTools(store),
    ...(options?.manifest ? createSourceTools(options.manifest) : []),
    ...(options?.sessionStore ? createSessionTools(options.sessionStore) : []),
    ...(options?.pluginTools ?? []),
    ...(options?.skillTools ?? []),
  ];

  return createSdkMcpServer({
    name: "marvin-governance",
    version: "0.1.0",
    tools,
  });
}
