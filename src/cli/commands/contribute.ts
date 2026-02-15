import chalk from "chalk";
import { loadProject } from "../../core/project.js";
import { getPersona, resolvePersonaId } from "../../personas/registry.js";
import { contributeFromPersona } from "../../contributions/contribute.js";

export interface ContributeCommandOptions {
  as?: string;
  type?: string;
  prompt?: string;
  about?: string;
  draft?: boolean;
}

export async function contributeCommand(
  options: ContributeCommandOptions,
): Promise<void> {
  const project = loadProject();
  const marvinDir = project.marvinDir;

  if (!options.as) {
    console.log(chalk.red("Missing required option: --as <persona>"));
    console.log(chalk.dim("Example: marvin contribute --as tl --type action-result --prompt \"...\""));
    return;
  }

  if (!options.type) {
    console.log(chalk.red("Missing required option: --type <contribution-type>"));
    const personaId = resolvePersonaId(options.as);
    const persona = getPersona(personaId);
    if (persona?.contributionTypes?.length) {
      console.log(chalk.dim(`Available types for ${persona.name}: ${persona.contributionTypes.join(", ")}`));
    }
    return;
  }

  if (!options.prompt) {
    console.log(chalk.red("Missing required option: --prompt <text>"));
    console.log(chalk.dim("Provide the contribution content via --prompt."));
    return;
  }

  const personaId = resolvePersonaId(options.as);
  const persona = getPersona(personaId);
  if (!persona) {
    console.log(chalk.red(`Unknown persona: ${options.as}`));
    return;
  }

  const isDraft = options.draft !== false; // default true

  console.log(chalk.bold(`\nContribution: ${options.type}`));
  console.log(chalk.dim(`Persona: ${persona.name}`));
  console.log(chalk.dim(`Mode: ${isDraft ? "draft (propose only)" : "direct (execute effects)"}`));
  if (options.about) {
    console.log(chalk.dim(`About: ${options.about}`));
  }
  console.log();

  await contributeFromPersona({
    marvinDir,
    persona: options.as,
    contributionType: options.type,
    prompt: options.prompt,
    aboutArtifact: options.about,
    draft: isDraft,
  });
}
