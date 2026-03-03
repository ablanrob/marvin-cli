import ora from "ora";
import { loadProject } from "../../core/project.js";
import { resolvePlugin } from "../../plugins/registry.js";
import { DocumentStore } from "../../storage/store.js";
import { collectGarMetrics, evaluateGar, renderAscii, renderConfluence } from "../../reports/gar/index.js";
import {
  collectHealthMetrics,
  evaluateHealth,
  renderAscii as renderHealthAscii,
  renderConfluence as renderHealthConfluence,
} from "../../reports/health/index.js";
import { collectSprintSummaryData } from "../../reports/sprint-summary/collector.js";
import { generateSprintSummary } from "../../reports/sprint-summary/generator.js";
import { loadAllSkills, collectSkillRegistrations } from "../../skills/registry.js";

export async function garReportCommand(options: {
  format?: "ascii" | "confluence";
}): Promise<void> {
  const project = loadProject();
  const plugin = resolvePlugin(project.config.methodology);
  const registrations = plugin?.documentTypeRegistrations ?? [];
  const store = new DocumentStore(project.marvinDir, registrations);

  const metrics = collectGarMetrics(store);
  const report = evaluateGar(project.config.name, metrics);

  const format = options.format ?? "ascii";
  if (format === "confluence") {
    console.log(renderConfluence(report));
  } else {
    console.log(renderAscii(report));
  }
}

export async function healthReportCommand(options: {
  format?: "ascii" | "confluence";
}): Promise<void> {
  const project = loadProject();
  const plugin = resolvePlugin(project.config.methodology);
  const registrations = plugin?.documentTypeRegistrations ?? [];
  const store = new DocumentStore(project.marvinDir, registrations);

  const metrics = collectHealthMetrics(store);
  const report = evaluateHealth(project.config.name, metrics);

  const format = options.format ?? "ascii";
  if (format === "confluence") {
    console.log(renderHealthConfluence(report));
  } else {
    console.log(renderHealthAscii(report));
  }
}

export async function sprintSummaryCommand(options: {
  sprint?: string;
  save?: boolean;
}): Promise<void> {
  const project = loadProject();
  const plugin = resolvePlugin(project.config.methodology);
  const pluginRegistrations = plugin?.documentTypeRegistrations ?? [];
  const allSkills = loadAllSkills(project.marvinDir);
  const allSkillIds = [...allSkills.keys()];
  const skillRegistrations = collectSkillRegistrations(allSkillIds, allSkills);
  const store = new DocumentStore(project.marvinDir, [...pluginRegistrations, ...skillRegistrations]);

  const data = collectSprintSummaryData(store, options.sprint);
  if (!data) {
    const msg = options.sprint
      ? `Sprint ${options.sprint} not found.`
      : "No active sprint found. Use --sprint <id> to specify one.";
    console.error(msg);
    process.exit(1);
  }

  const spinner = ora({ text: "Generating AI sprint summary...", color: "cyan" }).start();

  try {
    const summary = await generateSprintSummary(data);
    spinner.stop();

    const header = `# Sprint Summary: ${data.sprint.id} — ${data.sprint.title}\n\n`;
    console.log(header + summary);

    if (options.save) {
      const doc = store.create(
        "report",
        {
          title: `Sprint Summary: ${data.sprint.title}`,
          status: "final",
          tags: [`report-type:sprint-summary`, `sprint:${data.sprint.id}`],
        },
        summary,
      );
      console.log(`\nSaved as ${doc.frontmatter.id}`);
    }
  } catch (err) {
    spinner.stop();
    console.error("Failed to generate sprint summary:", err);
    process.exit(1);
  }
}
