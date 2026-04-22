import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import { DocumentStore } from "../../../src/storage/store.js";
import { SourceManifestManager } from "../../../src/sources/manifest.js";
import { runHealthCheck } from "../../../src/doctor/health/engine.js";
import type { HealthContext } from "../../../src/doctor/health/types.js";
import type { MarvinProjectConfig } from "../../../src/core/config.js";

function setup(options?: { methodology?: string; jiraProjectKey?: string }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-health-test-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  const docsDir = path.join(marvinDir, "docs");
  const sourcesDir = path.join(marvinDir, "sources");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(sourcesDir, { recursive: true });

  const config: MarvinProjectConfig = {
    name: "test-project",
    methodology: options?.methodology,
    jira: options?.jiraProjectKey ? { projectKey: options.jiraProjectKey } : undefined,
  };

  fs.writeFileSync(path.join(marvinDir, "config.yaml"), YAML.stringify(config), "utf-8");

  const registrations = [
    { type: "feature", dirName: "features", idPrefix: "F" },
    { type: "epic", dirName: "epics", idPrefix: "E" },
    { type: "sprint", dirName: "sprints", idPrefix: "S" },
    { type: "use-case", dirName: "use-cases", idPrefix: "UC" },
    { type: "tech-assessment", dirName: "tech-assessments", idPrefix: "TA" },
    { type: "extension-design", dirName: "extension-designs", idPrefix: "XD" },
  ];

  const store = new DocumentStore(marvinDir, registrations);
  const manifest = new SourceManifestManager(marvinDir);

  const ctx: HealthContext = { store, config, manifest, marvinDir };
  return { tmpDir, marvinDir, store, manifest, ctx };
}

describe("Health Check Engine", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return no findings for an empty project with no sources", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    // Remove sources dir so empty-project doesn't suggest ingesting
    fs.rmSync(path.join(env.marvinDir, "sources"), { recursive: true, force: true });
    const ctx = { ...env.ctx, manifest: undefined };

    const report = runHealthCheck(ctx);

    // Only the empty project observation
    expect(report.totalFindings).toBe(1);
    expect(report.findings[0].checkId).toBe("empty-project");
    expect(report.findings[0].severity).toBe("observation");
  });

  it("should flag empty project with pending source files", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    fs.writeFileSync(path.join(env.marvinDir, "sources", "requirements.pdf"), "fake pdf content");

    const report = runHealthCheck(env.ctx);

    const emptyProject = report.findings.find((f) => f.checkId === "empty-project");
    expect(emptyProject).toBeDefined();
    expect(emptyProject!.severity).toBe("recommendation");
    expect(emptyProject!.message).toContain("source file(s)");

    // unprocessed-sources also fires
    const unprocessed = report.findings.find((f) => f.checkId === "unprocessed-sources");
    expect(unprocessed).toBeDefined();
  });

  it("should flag missing sprints when actions exist", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    env.store.create("action", { title: "Set up CI/CD" });
    env.store.create("action", { title: "Provision cloud" });

    const report = runHealthCheck(env.ctx);

    const noSprints = report.findings.find((f) => f.checkId === "no-sprints");
    expect(noSprints).toBeDefined();
    expect(noSprints!.severity).toBe("recommendation");
    expect(noSprints!.message).toContain("2 action(s)");
    expect(noSprints!.suggestion).toContain("Sprint 0");
  });

  it("should not flag missing sprints when sprints exist", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    env.store.create("action", { title: "Set up CI/CD" });
    env.store.create("sprint", { title: "Sprint 0", status: "active" });

    const report = runHealthCheck(env.ctx);

    const noSprints = report.findings.find((f) => f.checkId === "no-sprints");
    expect(noSprints).toBeUndefined();
  });

  it("should flag unassigned actions when sprints exist", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    env.store.create("action", { title: "Unassigned task", status: "open" });
    env.store.create("action", { title: "Assigned task", status: "open", sprint: "S-001" });
    env.store.create("sprint", { title: "Sprint 1", status: "active" });

    const report = runHealthCheck(env.ctx);

    const unassigned = report.findings.find((f) => f.checkId === "unassigned-actions");
    expect(unassigned).toBeDefined();
    expect(unassigned!.message).toContain("1 open action(s)");
  });

  it("should not flag unassigned actions when no sprints exist", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    env.store.create("action", { title: "Some action", status: "open" });

    const report = runHealthCheck(env.ctx);

    const unassigned = report.findings.find((f) => f.checkId === "unassigned-actions");
    expect(unassigned).toBeUndefined();
  });

  it("should flag missing Jira project when artifacts exist", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    env.store.create("decision", { title: "Use React" });

    const report = runHealthCheck(env.ctx);

    const noJira = report.findings.find((f) => f.checkId === "no-jira-project");
    expect(noJira).toBeDefined();
    expect(noJira!.severity).toBe("observation");
  });

  it("should not flag Jira when project key is configured", () => {
    const env = setup({ jiraProjectKey: "TEST" });
    tmpDir = env.tmpDir;

    env.store.create("decision", { title: "Use React" });

    const report = runHealthCheck(env.ctx);

    const noJira = report.findings.find((f) => f.checkId === "no-jira-project");
    expect(noJira).toBeUndefined();
  });

  it("should produce correct summary counts", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    env.store.create("action", { title: "Some action" });
    fs.writeFileSync(path.join(env.marvinDir, "sources", "spec.md"), "# Spec");

    const report = runHealthCheck(env.ctx);

    expect(report.summary.recommendations + report.summary.observations).toBe(report.totalFindings);
    expect(Object.values(report.summary.byCheck).reduce((a, b) => a + b, 0)).toBe(
      report.totalFindings,
    );
  });
});
