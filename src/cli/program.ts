import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { chatCommand } from "./commands/chat.js";
import { listSessionsCommand, deleteSessionCommand } from "./commands/sessions.js";
import { statusCommand } from "./commands/status.js";
import { configCommand } from "./commands/config.js";
import { ingestCommand } from "./commands/ingest.js";
import {
  syncInitCommand,
  syncCommand,
  syncStatusCommand,
  syncRemoteCommand,
  cloneCommand,
} from "./commands/sync.js";
import { serveCommand } from "./commands/serve.js";
import {
  skillsListCommand,
  skillsInstallCommand,
  skillsRemoveCommand,
  skillsCreateCommand,
} from "./commands/skills.js";
import { importCommand } from "./commands/import.js";
import { analyzeCommand } from "./commands/analyze.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("marvin")
    .description(
      "AI-powered product development assistant with Product Owner, Delivery Manager, and Technical Lead personas",
    )
    .version(process.env.APP_VERSION!);

  program
    .command("init")
    .description("Initialize a new Marvin project in the current directory")
    .action(async () => {
      await initCommand();
    });

  program
    .command("chat")
    .description("Start an interactive chat session with a persona")
    .option(
      "--as <persona>",
      "Persona to chat as (po, dm, tl, product-owner, delivery-manager, tech-lead)",
    )
    .option("-p, --prompt <text>", "Initial prompt instead of interactive mode")
    .option("--resume [name]", "Resume a saved session (interactive picker if no name given)")
    .action(async (options) => {
      await chatCommand(options);
    });

  const sessionsCmd = program
    .command("sessions")
    .description("Manage saved chat sessions")
    .action(async () => {
      await listSessionsCommand();
    });

  sessionsCmd
    .command("delete <name>")
    .description("Delete a saved session")
    .action(async (name: string) => {
      await deleteSessionCommand(name);
    });

  program
    .command("status")
    .description("Show project status and summary")
    .action(async () => {
      await statusCommand();
    });

  program
    .command("config [key] [value]")
    .description("View or set configuration values")
    .action(async (key?: string, value?: string) => {
      await configCommand(key, value);
    });

  program
    .command("ingest [file]")
    .description("Process source documents to extract governance artifacts")
    .option("--all", "Process all unprocessed source files")
    .option("--draft", "Propose artifacts without creating them (default)")
    .option("--no-draft", "Create artifacts directly via MCP tools")
    .option("--as <persona>", "Persona for analysis (default: product-owner)")
    .action(async (file: string | undefined, options) => {
      await ingestCommand(file, options);
    });

  const syncCmd = program
    .command("sync")
    .description("Sync governance data with git")
    .action(async () => {
      await syncCommand();
    });

  syncCmd
    .command("init")
    .description("Initialize git repository in .marvin/")
    .option("--remote <url>", "Remote repository URL")
    .action(async (options) => {
      await syncInitCommand(options);
    });

  syncCmd
    .command("status")
    .description("Show git sync status")
    .action(async () => {
      await syncStatusCommand();
    });

  syncCmd
    .command("remote <url>")
    .description("Set or update the remote repository URL")
    .action(async (url: string) => {
      await syncRemoteCommand(url);
    });

  program
    .command("clone <url> [directory]")
    .description("Clone governance data from a remote repository")
    .action(async (url: string, directory?: string) => {
      await cloneCommand(url, directory);
    });

  program
    .command("analyze <meeting-id>")
    .description("Analyze a meeting to extract decisions, actions, and questions")
    .option("--draft", "Propose artifacts without creating them (default)")
    .option("--no-draft", "Create artifacts directly via MCP tools")
    .option("--as <persona>", "Persona for analysis (default: delivery-manager)")
    .action(async (meetingId: string, options) => {
      await analyzeCommand(meetingId, options);
    });

  program
    .command("import <path>")
    .description("Import documents or sources from external paths")
    .option("--dry-run", "Preview without writing files")
    .option(
      "--conflict <strategy>",
      "ID conflict strategy: renumber, skip, overwrite (default: renumber)",
    )
    .option("--tag <tag>", "Add tag to all imported documents")
    .option("--ingest", "Trigger ingest after importing raw sources")
    .option("--no-ingest", "Do not trigger ingest after importing raw sources")
    .option("--as <persona>", "Persona for ingest (default: product-owner)")
    .option("--draft", "Draft mode for ingest (default)")
    .option("--no-draft", "Create artifacts directly during ingest")
    .action(async (inputPath: string, options) => {
      await importCommand(inputPath, options);
    });

  program
    .command("serve")
    .description("Start standalone MCP server for Claude Desktop/Code")
    .action(async () => {
      await serveCommand();
    });

  const skillsCmd = program
    .command("skills")
    .description("Manage per-persona skills")
    .action(async () => {
      await skillsListCommand();
    });

  skillsCmd
    .command("install <skill>")
    .description("Assign a skill to a persona")
    .requiredOption("--as <persona>", "Persona to assign the skill to")
    .action(async (skill: string, options) => {
      await skillsInstallCommand(skill, options);
    });

  skillsCmd
    .command("remove <skill>")
    .description("Unassign a skill from a persona")
    .requiredOption("--as <persona>", "Persona to remove the skill from")
    .action(async (skill: string, options) => {
      await skillsRemoveCommand(skill, options);
    });

  skillsCmd
    .command("create <name>")
    .description("Create a YAML skill template in .marvin/skills/")
    .action(async (name: string) => {
      await skillsCreateCommand(name);
    });

  return program;
}
