import chalk from "chalk";
import { loadProject } from "../../core/project.js";
import { SessionStore } from "../../storage/session-store.js";

export async function listSessionsCommand(): Promise<void> {
  const project = loadProject();
  const store = new SessionStore(project.marvinDir);
  const sessions = store.list();

  if (sessions.length === 0) {
    console.log(chalk.dim("No saved sessions."));
    return;
  }

  console.log(chalk.bold("\nSaved Sessions\n"));

  const nameWidth = Math.max(20, ...sessions.map((s) => s.name.length)) + 2;
  const personaWidth = 18;

  console.log(
    chalk.dim(
      "  " +
        "Name".padEnd(nameWidth) +
        "Persona".padEnd(personaWidth) +
        "Last Used".padEnd(22) +
        "Turns",
    ),
  );
  console.log(chalk.dim("  " + "-".repeat(nameWidth + personaWidth + 22 + 6)));

  for (const s of sessions) {
    const ago = timeAgo(s.lastUsed);
    console.log(
      "  " +
        chalk.cyan(s.name.padEnd(nameWidth)) +
        s.persona.padEnd(personaWidth) +
        chalk.dim(ago.padEnd(22)) +
        String(s.turnCount),
    );
  }

  console.log();
}

export async function deleteSessionCommand(name: string): Promise<void> {
  const project = loadProject();
  const store = new SessionStore(project.marvinDir);

  const deleted = store.delete(name);
  if (deleted) {
    console.log(chalk.green(`Session "${name}" deleted.`));
  } else {
    console.log(chalk.red(`Session "${name}" not found.`));
  }
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
