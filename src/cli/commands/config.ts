import chalk from "chalk";
import { input, password } from "@inquirer/prompts";
import { loadUserConfig, saveUserConfig } from "../../core/config.js";

export async function configCommand(key?: string, value?: string): Promise<void> {
  if (key === "api-key") {
    return setApiKey();
  }

  if (key === "jira") {
    return setJira();
  }

  if (!key) {
    const config = loadUserConfig();
    console.log(chalk.bold("\nUser Configuration:\n"));
    console.log(
      `  API Key:         ${config.apiKey ? chalk.green("configured") : chalk.red("not set")}`,
    );
    console.log(
      `  Default Model:   ${config.defaultModel ?? chalk.dim("(default: claude-sonnet-4-5-20250929)")}`,
    );
    console.log(
      `  Default Persona: ${config.defaultPersona ?? chalk.dim("(default: product-owner)")}`,
    );
    console.log(
      `  Jira:            ${config.jira?.host ? chalk.green(`configured (${config.jira.host})`) : chalk.red("not set")}`,
    );
    console.log();
    return;
  }

  if (key && value) {
    const config = loadUserConfig();
    if (key === "default-model" || key === "defaultModel") {
      config.defaultModel = value;
    } else if (key === "default-persona" || key === "defaultPersona") {
      config.defaultPersona = value;
    } else {
      console.log(chalk.red(`Unknown config key: ${key}`));
      return;
    }
    saveUserConfig(config);
    console.log(chalk.green(`Set ${key} = ${value}`));
    return;
  }

  if (key && !value) {
    const config = loadUserConfig();
    const keyMap: Record<string, string | undefined> = {
      "default-model": config.defaultModel,
      defaultModel: config.defaultModel,
      "default-persona": config.defaultPersona,
      defaultPersona: config.defaultPersona,
    };
    if (key in keyMap) {
      console.log(keyMap[key] ?? chalk.dim("(not set)"));
    } else {
      console.log(chalk.red(`Unknown config key: ${key}`));
    }
  }
}

async function setJira(): Promise<void> {
  const host = await input({
    message: "Jira host (e.g. mycompany.atlassian.net):",
  });
  if (!host.trim()) {
    console.log(chalk.red("No host provided."));
    return;
  }

  const email = await input({
    message: "Jira email:",
  });
  if (!email.trim()) {
    console.log(chalk.red("No email provided."));
    return;
  }

  const apiToken = await password({
    message: "Jira API token:",
  });
  if (!apiToken.trim()) {
    console.log(chalk.red("No API token provided."));
    return;
  }

  const config = loadUserConfig();
  config.jira = {
    host: host.trim(),
    email: email.trim(),
    apiToken: apiToken.trim(),
  };
  saveUserConfig(config);
  console.log(chalk.green("Jira credentials saved."));
}

async function setApiKey(): Promise<void> {
  const apiKey = await password({
    message: "Enter your Anthropic API key:",
  });

  if (!apiKey.trim()) {
    console.log(chalk.red("No API key provided."));
    return;
  }

  const config = loadUserConfig();
  config.apiKey = apiKey.trim();
  saveUserConfig(config);
  console.log(chalk.green("API key saved."));
}
