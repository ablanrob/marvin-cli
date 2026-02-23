import { loadProject } from "../../core/project.js";
import { resolvePlugin } from "../../plugins/registry.js";
import { DocumentStore } from "../../storage/store.js";
import { collectGarMetrics, evaluateGar, renderAscii, renderConfluence } from "../../reports/gar/index.js";

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
