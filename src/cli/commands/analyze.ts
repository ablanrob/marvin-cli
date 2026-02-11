import chalk from "chalk";
import { loadProject } from "../../core/project.js";
import { resolvePlugin } from "../../plugins/registry.js";
import { getConfig } from "../../core/config.js";
import { DocumentStore } from "../../storage/store.js";
import { analyzeMeeting } from "../../analysis/analyze.js";

export interface AnalyzeCommandOptions {
  draft?: boolean;
  as?: string;
}

export async function analyzeCommand(
  meetingId: string,
  options: AnalyzeCommandOptions,
): Promise<void> {
  const project = loadProject();
  const marvinDir = project.marvinDir;

  const config = getConfig(marvinDir);
  const plugin = resolvePlugin(config.project.methodology);
  const registrations = plugin?.documentTypeRegistrations ?? [];
  const store = new DocumentStore(marvinDir, registrations);

  // Validate meeting exists
  const meetingDoc = store.get(meetingId);
  if (!meetingDoc) {
    console.log(chalk.red(`Meeting ${meetingId} not found.`));
    console.log(chalk.dim(`Use "marvin chat --as dm" to create meetings, or check the ID.`));
    return;
  }

  if (meetingDoc.frontmatter.type !== "meeting") {
    console.log(chalk.red(`Document ${meetingId} is not a meeting (type: ${meetingDoc.frontmatter.type}).`));
    return;
  }

  const isDraft = options.draft !== false; // default true
  const persona = options.as ?? "delivery-manager";

  console.log(chalk.bold(`\nAnalyzing meeting: ${meetingDoc.frontmatter.title}`));
  console.log(chalk.dim(`Mode: ${isDraft ? "draft (propose only)" : "direct (create artifacts)"}`));
  console.log(chalk.dim(`Persona: ${persona}\n`));

  await analyzeMeeting({
    marvinDir,
    meetingId,
    draft: isDraft,
    persona,
  });
}
