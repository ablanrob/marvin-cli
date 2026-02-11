import type { PersonaDefinition } from "../personas/types.js";
import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../storage/store.js";
import type { DocumentTypeRegistration } from "../storage/types.js";

export interface MarvinPlugin {
  id: string;
  name: string;
  description: string;
  version: string;

  /** Additional personas provided by this plugin */
  personas?: PersonaDefinition[];

  /** Additional MCP tools provided by this plugin */
  tools?: (store: DocumentStore, marvinDir?: string) => SdkMcpToolDefinition[];

  /** Additional document types this plugin handles */
  documentTypes?: string[];

  /** Document type registrations for extending the storage layer */
  documentTypeRegistrations?: DocumentTypeRegistration[];

  /** Prompt fragments injected per persona. Key is persona ID; "*" applies to all. */
  promptFragments?: Record<string, string>;

  /** Lifecycle hook: called when plugin is loaded */
  onLoad?: () => Promise<void>;
}
