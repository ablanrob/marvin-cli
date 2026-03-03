import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../storage/store.js";
import type { DocumentTypeRegistration } from "../storage/types.js";
import type { MarvinProjectConfig } from "../core/config.js";

export type SkillFormat = 'builtin-ts' | 'yaml' | 'skill-md';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  format: SkillFormat;
  dirPath?: string;
  personas?: string[];
  documentTypeRegistrations?: DocumentTypeRegistration[];
  tools?: (store: DocumentStore, projectConfig?: MarvinProjectConfig) => SdkMcpToolDefinition<any>[];
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
  format: SkillFormat;
  assignedPersonas: string[];
}
