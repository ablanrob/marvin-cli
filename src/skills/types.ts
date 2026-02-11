import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../storage/store.js";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  personas?: string[];
  tools?: (store: DocumentStore) => SdkMcpToolDefinition<any>[];
  promptFragments?: Record<string, string>;
  actions?: SkillAction[];
}

export interface SkillAction {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  maxTurns?: number;
  allowGovernanceTools?: boolean;
}

export interface SkillInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  assignedPersonas: string[];
}
