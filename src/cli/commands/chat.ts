import chalk from "chalk";
import { select } from "@inquirer/prompts";
import { loadProject } from "../../core/project.js";
import { getConfig } from "../../core/config.js";
import { getPersona, resolvePersonaId } from "../../personas/registry.js";
import { startSession } from "../../agent/session.js";
import { SessionStore } from "../../storage/session-store.js";

export interface ChatOptions {
  as?: string;
  prompt?: string;
  resume?: string | true;
}

export async function chatCommand(options: ChatOptions): Promise<void> {
  const project = loadProject();
  const config = getConfig(project.marvinDir);

  if (!config.apiKey) {
    console.log(
      chalk.red(
        'No API key found. Set ANTHROPIC_API_KEY or run "marvin config api-key".',
      ),
    );
    process.exit(1);
  }

  let sessionName: string | undefined;

  if (options.resume) {
    const sessionStore = new SessionStore(project.marvinDir);

    if (options.resume === true) {
      // Interactive picker
      const sessions = sessionStore.list();
      if (sessions.length === 0) {
        console.log(chalk.dim("No saved sessions to resume."));
        return;
      }

      const choice = await select({
        message: "Select a session to resume:",
        choices: sessions.map((s) => ({
          name: `${s.name}  (${s.persona}, ${timeAgo(s.lastUsed)}, ${s.turnCount} turns)`,
          value: s.name,
        })),
      });
      sessionName = choice;
    } else {
      sessionName = options.resume;
    }
  }

  const personaInput = options.as ?? config.defaultPersona;
  const personaId = resolvePersonaId(personaInput);
  const persona = getPersona(personaId)!;

  await startSession({
    persona,
    config,
    marvinDir: project.marvinDir,
    projectRoot: project.root,
    initialPrompt: options.prompt,
    sessionName,
  });
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
