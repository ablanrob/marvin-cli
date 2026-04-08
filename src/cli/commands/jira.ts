import chalk from "chalk";
import { loadProject } from "../../core/project.js";
import { loadUserConfig } from "../../core/config.js";
import { resolvePlugin } from "../../plugins/registry.js";
import { DocumentStore } from "../../storage/store.js";
import { createJiraClient } from "../../skills/builtin/jira/client.js";
import {
  fetchJiraStatus,
  syncJiraProgress,
  normalizeStatusMap,
  DEFAULT_ACTION_STATUS_MAP,
  DEFAULT_TASK_STATUS_MAP,
} from "../../skills/builtin/jira/sync.js";
import { fetchJiraDaily, type DailyIssueEntry } from "../../skills/builtin/jira/daily.js";

export async function jiraSyncCommand(
  artifactId?: string,
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const project = loadProject();
  const plugin = resolvePlugin(project.config.methodology);
  const registrations = plugin?.documentTypeRegistrations ?? [];
  const jiReg = { type: "jira-issue", dirName: "jira-issues", idPrefix: "JI" };
  const store = new DocumentStore(project.marvinDir, [...registrations, jiReg]);

  const jiraUserConfig = loadUserConfig().jira;
  const jira = createJiraClient(jiraUserConfig);
  if (!jira) {
    console.log(
      chalk.red(
        'Jira is not configured. Run "marvin config jira" or set JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.',
      ),
    );
    return;
  }

  const statusMap = normalizeStatusMap(project.config.jira?.statusMap);

  const label = artifactId
    ? `Checking ${artifactId} against Jira...`
    : "Checking all Jira-linked actions/tasks...";
  console.log(chalk.dim(label));

  if (options.dryRun) {
    // Preview only — no writes
    const fetchResult = await fetchJiraStatus(store, jira.client, jira.host, artifactId, statusMap);

    const withChanges = fetchResult.artifacts.filter((a) => a.statusChanged || a.progressChanged);
    const noChanges = fetchResult.artifacts.filter((a) => !a.statusChanged && !a.progressChanged);

    if (withChanges.length > 0) {
      console.log(chalk.yellow(`\nProposed changes for ${withChanges.length} artifact(s):`));
      for (const a of withChanges) {
        console.log(`  ${chalk.bold(a.id)} (${a.jiraKey}) — Jira: "${a.jiraSummary}"`);
        if (a.statusChanged) {
          console.log(
            `    status: ${chalk.yellow(a.currentMarvinStatus)} → ${chalk.green(a.proposedMarvinStatus)}`,
          );
        }
        if (a.progressChanged) {
          console.log(
            `    progress: ${chalk.yellow(`${String(a.currentProgress ?? 0)}%`)} → ${chalk.green(`${String(a.proposedProgress)}%`)}`,
          );
        }
        if (a.linkedIssues.length > 0) {
          const done = a.linkedIssues.filter((l) => l.isDone).length;
          console.log(chalk.dim(`    ${done}/${a.linkedIssues.length} linked issues done`));
        }
      }
      console.log(chalk.dim("\nRun without --dry-run to apply these changes."));
    }

    if (noChanges.length > 0) {
      console.log(chalk.dim(`\n${noChanges.length} artifact(s) already in sync.`));
    }

    if (fetchResult.errors.length > 0) {
      console.log(chalk.red("\nErrors:"));
      for (const err of fetchResult.errors) {
        console.log(chalk.red(`  ${err}`));
      }
    }

    if (fetchResult.artifacts.length === 0 && fetchResult.errors.length === 0) {
      console.log(chalk.dim("\nNo Jira-linked actions/tasks found to check."));
    }

    return;
  }

  // Apply mode
  const result = await syncJiraProgress(store, jira.client, jira.host, artifactId, statusMap);

  if (result.updated.length > 0) {
    console.log(chalk.green(`\nUpdated ${result.updated.length} artifact(s):`));
    for (const entry of result.updated) {
      const statusChange =
        entry.oldStatus !== entry.newStatus
          ? `${chalk.yellow(entry.oldStatus)} → ${chalk.green(entry.newStatus)}`
          : chalk.dim(entry.newStatus);
      console.log(`  ${chalk.bold(entry.id)} (${entry.jiraKey}): ${statusChange}`);

      if (entry.linkedIssues.length > 0) {
        const done = entry.linkedIssues.filter((l) => l.isDone).length;
        console.log(chalk.dim(`    ${done}/${entry.linkedIssues.length} linked issues done`));
        for (const li of entry.linkedIssues) {
          const icon = li.isDone ? chalk.green("✓") : chalk.dim("○");
          console.log(chalk.dim(`      ${icon} ${li.key} ${li.summary} [${li.relationship}]`));
        }
      }
    }
  }

  if (result.unchanged > 0) {
    console.log(chalk.dim(`\n${result.unchanged} artifact(s) unchanged.`));
  }

  if (result.errors.length > 0) {
    console.log(chalk.red("\nErrors:"));
    for (const err of result.errors) {
      console.log(chalk.red(`  ${err}`));
    }
  }

  if (result.updated.length === 0 && result.unchanged === 0 && result.errors.length === 0) {
    console.log(chalk.dim("\nNo Jira-linked actions/tasks found to sync."));
  }
}

export async function jiraStatusesCommand(projectKey?: string): Promise<void> {
  const project = loadProject();
  const jiraUserConfig = loadUserConfig().jira;
  const jira = createJiraClient(jiraUserConfig);
  if (!jira) {
    console.log(
      chalk.red(
        'Jira is not configured. Run "marvin config jira" or set JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.',
      ),
    );
    return;
  }

  const resolvedProjectKey = projectKey ?? project.config.jira?.projectKey;
  if (!resolvedProjectKey) {
    console.log(
      chalk.red(
        "No project key provided. Pass it as an argument or set jira.projectKey in .marvin/config.yaml.",
      ),
    );
    return;
  }

  console.log(chalk.dim(`Fetching statuses from Jira project ${resolvedProjectKey}...`));

  const statusMap = normalizeStatusMap(project.config.jira?.statusMap);

  let data: { total: number; issues: { fields: { status: { name: string } } }[] };
  try {
    data = await jira.client.searchIssuesV3(`project = ${resolvedProjectKey}`, ["status"], 100);
  } catch (err) {
    console.log(chalk.red(`Jira API error: ${err instanceof Error ? err.message : String(err)}`));
    return;
  }

  // Collect distinct statuses
  const statusCounts = new Map<string, number>();
  for (const issue of data.issues) {
    const s = issue.fields.status.name;
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
  }

  // Build lookups
  const actionLookup = new Map<string, string>();
  const taskLookup = new Map<string, string>();

  if (statusMap.flat) {
    for (const [jiraStatus, value] of Object.entries(statusMap.flat)) {
      const lower = jiraStatus.toLowerCase();
      if (typeof value === "string") {
        actionLookup.set(lower, value);
        taskLookup.set(lower, value);
      } else {
        const label = value.inSprint
          ? `${value.default} / ${value.inSprint} (inSprint)`
          : value.default;
        actionLookup.set(lower, label);
        taskLookup.set(lower, label);
      }
    }
  } else {
    const actionMap = statusMap.legacy?.action ?? DEFAULT_ACTION_STATUS_MAP;
    const taskMap = statusMap.legacy?.task ?? DEFAULT_TASK_STATUS_MAP;
    for (const [marvin, jiraStatuses] of Object.entries(actionMap)) {
      for (const js of jiraStatuses) actionLookup.set(js.toLowerCase(), marvin);
    }
    for (const [marvin, jiraStatuses] of Object.entries(taskMap)) {
      for (const js of jiraStatuses) taskLookup.set(js.toLowerCase(), marvin);
    }
  }

  console.log(
    `\nFound ${chalk.bold(String(statusCounts.size))} distinct statuses in ${chalk.bold(resolvedProjectKey)} (scanned ${data.issues.length} of ${data.total} issues):\n`,
  );

  const sorted = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]);
  let hasUnmapped = false;

  for (const [status, count] of sorted) {
    const actionTarget = actionLookup.get(status.toLowerCase());
    const taskTarget = taskLookup.get(status.toLowerCase());
    const actionLabel = actionTarget
      ? chalk.green(`→ ${actionTarget}`)
      : chalk.yellow("UNMAPPED (→ open)");
    const taskLabel = taskTarget
      ? chalk.green(`→ ${taskTarget}`)
      : chalk.yellow("UNMAPPED (→ backlog)");

    if (!actionTarget || !taskTarget) hasUnmapped = true;

    console.log(`  ${chalk.bold(status)} ${chalk.dim(`(${count} issues)`)}`);
    console.log(`    action: ${actionLabel}`);
    console.log(`    task:   ${taskLabel}`);
  }

  if (hasUnmapped) {
    console.log(
      chalk.yellow("\nSome statuses are unmapped. Add jira.statusMap to .marvin/config.yaml:"),
    );
    console.log(chalk.dim("  jira:"));
    console.log(chalk.dim("    statusMap:"));
    console.log(chalk.dim('      "<Jira Status>": <marvin-status>'));
  } else {
    console.log(chalk.green("\nAll statuses are mapped."));
  }

  const usingConfig = statusMap.flat ?? statusMap.legacy;
  console.log(
    chalk.dim(
      usingConfig
        ? "\nUsing status maps from .marvin/config.yaml."
        : "\nUsing built-in default status maps (no jira.statusMap in config).",
    ),
  );
}

export async function jiraDailyCommand(options: {
  from?: string;
  to?: string;
  project?: string;
}): Promise<void> {
  const proj = loadProject();
  const plugin = resolvePlugin(proj.config.methodology);
  const registrations = plugin?.documentTypeRegistrations ?? [];
  const jiReg = { type: "jira-issue", dirName: "jira-issues", idPrefix: "JI" };
  const store = new DocumentStore(proj.marvinDir, [...registrations, jiReg]);

  const jiraUserConfig = loadUserConfig().jira;
  const jira = createJiraClient(jiraUserConfig);
  if (!jira) {
    console.log(
      chalk.red(
        'Jira is not configured. Run "marvin config jira" or set JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.',
      ),
    );
    return;
  }

  const resolvedProjectKey = options.project ?? proj.config.jira?.projectKey;
  if (!resolvedProjectKey) {
    console.log(
      chalk.red(
        "No project key provided. Use --project or set jira.projectKey in .marvin/config.yaml.",
      ),
    );
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const fromDate = options.from ?? today;
  const toDate = options.to ?? fromDate;
  const statusMap = normalizeStatusMap(proj.config.jira?.statusMap);

  const rangeLabel = fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;
  console.log(
    chalk.dim(`Fetching Jira daily summary for ${resolvedProjectKey} — ${rangeLabel}...`),
  );

  const daily = await fetchJiraDaily(
    store,
    jira.client,
    jira.host,
    resolvedProjectKey,
    { from: fromDate, to: toDate },
    statusMap,
  );

  console.log(`\n${chalk.bold(`Jira Daily — ${resolvedProjectKey} — ${rangeLabel}`)}`);
  console.log(`${daily.issues.length} issue(s) updated.\n`);

  const linked = daily.issues.filter((i) => i.marvinArtifacts.length > 0);
  const unlinked = daily.issues.filter((i) => i.marvinArtifacts.length === 0);

  if (linked.length > 0) {
    console.log(chalk.underline("Linked Issues (with Marvin artifacts):\n"));
    for (const issue of linked) {
      printIssueEntry(issue);
    }
  }

  if (unlinked.length > 0) {
    console.log(chalk.underline("Unlinked Issues (no Marvin artifact):\n"));
    for (const issue of unlinked) {
      printIssueEntry(issue);
    }
  }

  if (daily.proposedActions.length > 0) {
    console.log(chalk.underline("Proposed Actions:\n"));
    for (const action of daily.proposedActions) {
      const icon =
        action.type === "status-update"
          ? chalk.yellow("↻")
          : action.type === "unlinked-issue"
            ? chalk.blue("+")
            : action.type === "link-suggestion"
              ? chalk.cyan("🔗")
              : action.type === "question-candidate"
                ? chalk.magenta("?")
                : action.type === "decision-candidate"
                  ? chalk.yellow("⚖")
                  : action.type === "blocker-detected"
                    ? chalk.red("🚫")
                    : action.type === "resolution-detected"
                      ? chalk.green("✓")
                      : chalk.cyan("📄");
      console.log(`  ${icon} ${action.description}`);
    }
    console.log();
  }

  if (daily.errors.length > 0) {
    console.log(chalk.red("Errors:"));
    for (const err of daily.errors) {
      console.log(chalk.red(`  ${err}`));
    }
  }

  if (daily.issues.length === 0 && daily.errors.length === 0) {
    console.log(chalk.dim("No Jira activity found for this period."));
  }
}

function printIssueEntry(issue: DailyIssueEntry): void {
  const artifacts = issue.marvinArtifacts.map((a) => a.id).join(", ");
  const artifactLabel = artifacts ? chalk.cyan(` → ${artifacts}`) : "";

  console.log(
    `  ${chalk.bold(issue.key)} — ${issue.summary} [${chalk.yellow(issue.currentStatus)}]${artifactLabel}`,
  );
  console.log(
    chalk.dim(`  Type: ${issue.issueType} | Assignee: ${issue.assignee ?? "unassigned"}`),
  );

  for (const a of issue.marvinArtifacts) {
    if (a.statusDrift) {
      console.log(
        chalk.yellow(
          `  ⚠ ${a.id} status drift: Marvin="${a.currentStatus}" vs proposed="${a.proposedStatus}"`,
        ),
      );
    }
  }

  if (issue.changes.length > 0) {
    console.log(chalk.dim("  Changes:"));
    for (const c of issue.changes) {
      console.log(
        chalk.dim(
          `    ${c.field}: ${c.from ?? "∅"} → ${c.to ?? "∅"} (${c.author}, ${c.timestamp.slice(0, 16)})`,
        ),
      );
    }
  }

  if (issue.comments.length > 0) {
    console.log(chalk.dim(`  Comments (${issue.comments.length}):`));
    for (const c of issue.comments) {
      let signalLabel = "";
      if (c.signals.length > 0) {
        const labels = c.signals.map((s) =>
          s.type === "blocker"
            ? chalk.red("🚫blocker")
            : s.type === "decision"
              ? chalk.yellow("⚖decision")
              : s.type === "question"
                ? chalk.magenta("?question")
                : chalk.green("✓resolution"),
        );
        signalLabel = ` ${labels.join(" ")}`;
      }
      console.log(
        chalk.dim(`    ${c.author} (${c.created.slice(0, 16)})${signalLabel}: ${c.bodyPreview}`),
      );
    }
  }

  if (issue.linkSuggestions.length > 0) {
    console.log(chalk.cyan("  Possible Marvin matches:"));
    for (const s of issue.linkSuggestions) {
      console.log(
        chalk.cyan(
          `    🔗 ${s.artifactId} ("${s.artifactTitle}") — ${Math.round(s.score * 100)}% match [${s.sharedTerms.join(", ")}]`,
        ),
      );
    }
  }

  if (issue.linkedIssues.length > 0) {
    console.log(chalk.dim("  Linked issues:"));
    for (const li of issue.linkedIssues) {
      const icon = li.isDone ? chalk.green("✓") : chalk.dim("○");
      console.log(
        chalk.dim(`    ${icon} ${li.key} ${li.summary} [${li.relationship}] — ${li.status}`),
      );
    }
  }

  if (issue.confluenceLinks.length > 0) {
    console.log(chalk.dim("  Confluence pages:"));
    for (const cl of issue.confluenceLinks) {
      console.log(chalk.dim(`    📄 ${cl.title}: ${cl.url}`));
    }
  }

  console.log();
}
