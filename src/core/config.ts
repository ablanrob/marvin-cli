import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import { ConfigError } from "./errors.js";

export interface JiraUserConfig {
  host?: string;
  email?: string;
  apiToken?: string;
}

export interface MarvinUserConfig {
  apiKey?: string;
  defaultModel?: string;
  defaultPersona?: string;
  jira?: JiraUserConfig;
}

export interface GitConfig {
  remote?: string;
}

/**
 * Conditional status mapping: Jira status → Marvin status with sprint context.
 * Used when a Jira status should map differently based on sprint membership.
 */
export interface ConditionalJiraStatusMapping {
  default: string;
  inSprint?: string;
}

/**
 * Flat Jira→Marvin status map (spec format).
 * Keys are Jira status names, values are Marvin status strings or conditional objects.
 *
 * Example:
 *   "In Progress": in-progress
 *   "To Do":
 *     default: backlog
 *     inSprint: ready
 */
export interface FlatJiraStatusMap {
  [jiraStatus: string]: string | ConditionalJiraStatusMapping;
}

/**
 * Legacy Marvin→Jira[] status map (nested format).
 * Keys are Marvin status names, values are arrays of Jira status names.
 */
export interface LegacyJiraStatusMap {
  [marvinStatus: string]: string[];
}

export interface JiraProjectConfig {
  projectKey?: string;
  statusMap?:
    | FlatJiraStatusMap
    | {
        action?: LegacyJiraStatusMap;
        task?: LegacyJiraStatusMap;
      };
}

export interface MarvinProjectConfig {
  name: string;
  methodology?: string;
  personas?: Record<string, PersonaConfigOverride>;
  documentTypes?: string[];
  git?: GitConfig;
  skills?: Record<string, string[]>;
  jira?: JiraProjectConfig;
}

export interface PersonaConfigOverride {
  enabled?: boolean;
  extraInstructions?: string;
}

export interface MergedConfig {
  apiKey?: string;
  defaultModel: string;
  defaultPersona: string;
  project: MarvinProjectConfig;
}

function userConfigDir(): string {
  return path.join(os.homedir(), ".config", "marvin");
}

function userConfigPath(): string {
  return path.join(userConfigDir(), "config.yaml");
}

export function loadUserConfig(): MarvinUserConfig {
  const configPath = userConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return (YAML.parse(raw) as MarvinUserConfig) ?? {};
  } catch (err) {
    throw new ConfigError(`Failed to parse user config at ${configPath}: ${err}`);
  }
}

export function saveUserConfig(config: MarvinUserConfig): void {
  const dir = userConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(userConfigPath(), YAML.stringify(config), "utf-8");
}

export function loadProjectConfig(marvinDir: string): MarvinProjectConfig {
  const configPath = path.join(marvinDir, "config.yaml");
  if (!fs.existsSync(configPath)) {
    throw new ConfigError(`Project config not found at ${configPath}. Run "marvin init".`);
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = YAML.parse(raw) as MarvinProjectConfig;
    if (!parsed?.name) {
      throw new ConfigError("Project config must have a 'name' field.");
    }
    return parsed;
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`Failed to parse project config at ${configPath}: ${err}`);
  }
}

export function saveProjectConfig(marvinDir: string, config: MarvinProjectConfig): void {
  const configPath = path.join(marvinDir, "config.yaml");
  fs.writeFileSync(configPath, YAML.stringify(config), "utf-8");
}

export function mergeConfig(
  userConfig: MarvinUserConfig,
  projectConfig: MarvinProjectConfig,
): MergedConfig {
  const apiKey = userConfig.apiKey ?? process.env["ANTHROPIC_API_KEY"];
  return {
    apiKey,
    defaultModel: userConfig.defaultModel ?? "claude-sonnet-4-5-20250929",
    defaultPersona: userConfig.defaultPersona ?? "product-owner",
    project: projectConfig,
  };
}

export function getConfig(marvinDir: string): MergedConfig {
  const userConfig = loadUserConfig();
  const projectConfig = loadProjectConfig(marvinDir);
  return mergeConfig(userConfig, projectConfig);
}
