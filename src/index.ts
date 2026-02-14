// Core
export { findProjectRoot, isMarvinProject, loadProject } from "./core/project.js";
export { loadUserConfig, saveUserConfig, getConfig } from "./core/config.js";
export type { MarvinUserConfig, MarvinProjectConfig, MergedConfig } from "./core/config.js";
export {
  MarvinError,
  ProjectNotFoundError,
  ConfigError,
  ApiKeyMissingError,
} from "./core/errors.js";

// Storage
export { DocumentStore } from "./storage/store.js";
export { parseDocument, serializeDocument } from "./storage/document.js";
export type {
  Document,
  DocumentFrontmatter,
  DocumentType,
  DocumentQuery,
  DocumentTypeRegistration,
} from "./storage/types.js";
export { CORE_DOCUMENT_TYPES } from "./storage/types.js";

// Personas
export { getPersona, listPersonas, resolvePersonaId } from "./personas/registry.js";
export { buildSystemPrompt } from "./personas/prompt-builder.js";
export type { PersonaDefinition } from "./personas/types.js";

// Agent
export { createMarvinMcpServer } from "./agent/mcp-server.js";
export { startSession } from "./agent/session.js";
export type { SessionOptions } from "./agent/session.js";
export { SessionStore } from "./storage/session-store.js";
export type { SessionEntry } from "./storage/session-store.js";

// Sources
export { SourceManifestManager } from "./sources/manifest.js";
export type {
  SourceManifest,
  SourceFileEntry,
  SourceFileStatus,
  IngestOptions,
  IngestResult,
} from "./sources/types.js";

// Plugins
export type { MarvinPlugin } from "./plugins/types.js";
export { resolvePlugin, getPluginTools, getPluginPromptFragment } from "./plugins/registry.js";
export { COMMON_REGISTRATIONS, createCommonTools } from "./plugins/common.js";

// Skills
export type { SkillDefinition, SkillAction, SkillFormat, SkillInfo } from "./skills/types.js";
export {
  loadAllSkills,
  loadSkillFromDirectory,
  resolveSkillsForPersona,
  getSkillTools,
  getSkillPromptFragment,
  getSkillAgentDefinitions,
  migrateYamlToSkillMd,
} from "./skills/registry.js";

// MCP
export { startStdioServer, collectTools, registerSdkTools } from "./mcp/stdio-server.js";
export type { StdioServerOptions } from "./mcp/stdio-server.js";

// CLI
export { createProgram } from "./cli/program.js";
