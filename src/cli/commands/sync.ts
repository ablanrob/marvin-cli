import chalk from "chalk";
import ora from "ora";
import { input } from "@inquirer/prompts";
import { loadProject } from "../../core/project.js";
import {
  loadProjectConfig,
  saveProjectConfig,
} from "../../core/config.js";
import { MarvinGit } from "../../git/repository.js";
import { GitSyncError } from "../../core/errors.js";

export async function syncInitCommand(opts: {
  remote?: string;
}): Promise<void> {
  const project = loadProject();
  const git = new MarvinGit(project.marvinDir);

  let remote = opts.remote;
  if (!remote) {
    remote =
      (await input({
        message: "Remote repository URL (leave blank to skip):",
      })) || undefined;
  }

  const spinner = ora("Initializing git in .marvin/").start();
  try {
    await git.init(remote);
    spinner.succeed("Git repository initialized in .marvin/");
  } catch (err) {
    spinner.fail(
      err instanceof GitSyncError
        ? err.message
        : `Failed to initialize: ${err}`,
    );
    process.exit(1);
  }

  if (remote) {
    const config = loadProjectConfig(project.marvinDir);
    config.git = { remote };
    saveProjectConfig(project.marvinDir, config);
    console.log(chalk.dim(`  Remote: ${remote}`));
  }

  console.log(
    chalk.yellow(
      "\nRemember to add .marvin/ to your outer project's .gitignore if needed.",
    ),
  );
}

export async function syncCommand(): Promise<void> {
  const project = loadProject();
  const git = new MarvinGit(project.marvinDir);

  const spinner = ora("Syncing governance data").start();
  try {
    const result = await git.sync();

    if (!result.committed && !result.pulled && !result.pushed) {
      spinner.succeed("Nothing to sync — everything is up to date.");
      return;
    }

    spinner.succeed("Sync complete.");

    if (result.committed) {
      console.log(
        chalk.green(
          `  Committed ${result.filesChanged} file(s): ${result.commitMessage}`,
        ),
      );
    }
    if (result.pulled) {
      console.log(chalk.green("  Pulled latest changes."));
    }
    if (result.pushed) {
      console.log(chalk.green("  Pushed to remote."));
    }
  } catch (err) {
    spinner.fail(
      err instanceof GitSyncError ? err.message : `Sync failed: ${err}`,
    );
    process.exit(1);
  }
}

export async function syncStatusCommand(): Promise<void> {
  const project = loadProject();
  const git = new MarvinGit(project.marvinDir);
  const status = await git.status();

  if (!status.isRepo) {
    console.log(
      chalk.yellow(
        'Git not initialized in .marvin/. Run "marvin sync init" to set up.',
      ),
    );
    return;
  }

  console.log(chalk.bold("\nGit Sync Status\n"));
  console.log(`  Branch:  ${chalk.cyan(status.branch)}`);
  console.log(
    `  Remote:  ${status.hasRemote ? chalk.cyan(status.remoteUrl) : chalk.dim("not set")}`,
  );

  if (
    status.modified.length === 0 &&
    status.created.length === 0 &&
    status.deleted.length === 0
  ) {
    console.log(chalk.green("\n  Working tree is clean."));
  } else {
    if (status.modified.length > 0) {
      console.log(chalk.yellow(`\n  Modified (${status.modified.length}):`));
      for (const f of status.modified) {
        console.log(`    ${f}`);
      }
    }
    if (status.created.length > 0) {
      console.log(chalk.green(`\n  New (${status.created.length}):`));
      for (const f of status.created) {
        console.log(`    ${f}`);
      }
    }
    if (status.deleted.length > 0) {
      console.log(chalk.red(`\n  Deleted (${status.deleted.length}):`));
      for (const f of status.deleted) {
        console.log(`    ${f}`);
      }
    }
  }

  if (status.ahead > 0 || status.behind > 0) {
    console.log(
      chalk.dim(`\n  Ahead: ${status.ahead}  Behind: ${status.behind}`),
    );
  }

  if (status.conflicted.length > 0) {
    console.log(
      chalk.red(`\n  Conflicts (${status.conflicted.length}):`),
    );
    for (const f of status.conflicted) {
      console.log(`    ${f}`);
    }
  }

  console.log();
}

export async function syncRemoteCommand(url: string): Promise<void> {
  const project = loadProject();
  const git = new MarvinGit(project.marvinDir);

  if (!(await git.isRepository())) {
    console.log(
      chalk.red(
        'Git not initialized in .marvin/. Run "marvin sync init" first.',
      ),
    );
    process.exit(1);
  }

  try {
    await git.setRemote(url);
    const config = loadProjectConfig(project.marvinDir);
    config.git = { ...config.git, remote: url };
    saveProjectConfig(project.marvinDir, config);
    console.log(chalk.green(`Remote set to ${url}`));
  } catch (err) {
    console.log(
      chalk.red(
        err instanceof GitSyncError
          ? err.message
          : `Failed to set remote: ${err}`,
      ),
    );
    process.exit(1);
  }
}

export async function cloneCommand(
  url: string,
  directory?: string,
): Promise<void> {
  const targetDir = directory ?? process.cwd();

  const spinner = ora(`Cloning governance data into ${targetDir}/.marvin/`).start();
  try {
    const marvinDir = await MarvinGit.clone(url, targetDir);
    spinner.succeed(`Cloned governance data into ${marvinDir}`);
    console.log(chalk.dim('Run "marvin status" to see the project.'));
  } catch (err) {
    spinner.fail(
      err instanceof GitSyncError ? err.message : `Clone failed: ${err}`,
    );
    process.exit(1);
  }
}
