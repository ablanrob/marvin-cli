import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import { DocumentStore } from "../../../src/storage/store.js";
import { SourceManifestManager } from "../../../src/sources/manifest.js";
import { buildOnboardingGuide } from "../../../src/doctor/health/onboarding.js";
import type { HealthContext } from "../../../src/doctor/health/types.js";
import type { MarvinProjectConfig } from "../../../src/core/config.js";

function setup(options?: { methodology?: string; jiraProjectKey?: string; aemPhase?: string }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-onboarding-test-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  const docsDir = path.join(marvinDir, "docs");
  const sourcesDir = path.join(marvinDir, "sources");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(sourcesDir, { recursive: true });

  const config: MarvinProjectConfig = {
    name: "test-project",
    methodology: options?.methodology,
    jira: options?.jiraProjectKey ? { projectKey: options.jiraProjectKey } : undefined,
    aem: options?.aemPhase ? { currentPhase: options.aemPhase } : undefined,
  };

  fs.writeFileSync(path.join(marvinDir, "config.yaml"), YAML.stringify(config), "utf-8");

  const registrations = [
    { type: "feature", dirName: "features", idPrefix: "F" },
    { type: "epic", dirName: "epics", idPrefix: "E" },
    { type: "sprint", dirName: "sprints", idPrefix: "S" },
    { type: "use-case", dirName: "use-cases", idPrefix: "UC" },
  ];

  const store = new DocumentStore(marvinDir, registrations);
  const manifest = new SourceManifestManager(marvinDir);

  const ctx: HealthContext = { store, config, manifest, marvinDir };
  return { tmpDir, marvinDir, store, manifest, ctx };
}

describe("Onboarding Guide", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return empty status for a blank project", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    const guide = buildOnboardingGuide(env.ctx);

    expect(guide.status).toBe("empty");
    expect(guide.projectName).toBe("test-project");
    expect(guide.steps.length).toBeGreaterThan(0);
    expect(guide.steps.every((s) => !s.done || s.title === "Run a health check")).toBe(true);
  });

  it("should mark source ingestion as pending when sources exist", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    fs.writeFileSync(path.join(env.marvinDir, "sources", "spec.pdf"), "fake pdf");
    env.manifest.scan();

    const guide = buildOnboardingGuide(env.ctx);

    const ingestStep = guide.steps.find((s) => s.title === "Ingest source documents");
    expect(ingestStep).toBeDefined();
    expect(ingestStep!.done).toBe(false);
    expect(ingestStep!.description).toContain("1 source file(s)");
  });

  it("should use use-case language for SAP AEM projects", () => {
    const env = setup({ methodology: "sap-aem" });
    tmpDir = env.tmpDir;

    const guide = buildOnboardingGuide(env.ctx);

    expect(guide.methodology).toBe("sap-aem");
    const scopeStep = guide.steps.find((s) => s.title === "Define extension use cases");
    expect(scopeStep).toBeDefined();
    expect(scopeStep!.tool).toBe("create_use_case");
  });

  it("should use feature language for generic agile projects", () => {
    const env = setup({ methodology: "generic-agile" });
    tmpDir = env.tmpDir;

    const guide = buildOnboardingGuide(env.ctx);

    const scopeStep = guide.steps.find((s) => s.title === "Define features");
    expect(scopeStep).toBeDefined();
    expect(scopeStep!.tool).toBe("create_feature");
  });

  it("should mark Sprint 0 step as done when sprints exist", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    env.store.create("sprint", { title: "Sprint 0", status: "active" });

    const guide = buildOnboardingGuide(env.ctx);

    const sprintStep = guide.steps.find((s) => s.title === "Set up Sprint 0");
    expect(sprintStep).toBeDefined();
    expect(sprintStep!.done).toBe(true);
  });

  it("should mark Jira step as done when configured", () => {
    const env = setup({ jiraProjectKey: "TEST" });
    tmpDir = env.tmpDir;

    const guide = buildOnboardingGuide(env.ctx);

    const jiraStep = guide.steps.find((s) => s.title === "Configure Jira integration");
    expect(jiraStep).toBeDefined();
    expect(jiraStep!.done).toBe(true);
  });

  it("should report in-progress when most steps are done", () => {
    const env = setup({ jiraProjectKey: "TEST" });
    tmpDir = env.tmpDir;

    env.store.create("decision", { title: "Use React" });
    env.store.create("action", { title: "Set up CI/CD" });
    env.store.create("feature", { title: "Feature 1", status: "approved" });
    env.store.create("epic", { title: "Epic 1" });
    env.store.create("sprint", { title: "Sprint 0", status: "active" });

    const guide = buildOnboardingGuide(env.ctx);

    expect(guide.status).toBe("in-progress");
  });

  it("should include summary with next step", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    const guide = buildOnboardingGuide(env.ctx);

    expect(guide.summary).toContain("Next:");
    expect(guide.summary).toContain("of");
  });

  it("should include Sprint 0 description mentioning bootstrapping", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    const guide = buildOnboardingGuide(env.ctx);

    const sprintStep = guide.steps.find((s) => s.title === "Set up Sprint 0");
    expect(sprintStep).toBeDefined();
    expect(sprintStep!.description).toContain("bootstrapping");
    expect(sprintStep!.description).toContain("Sprint 1");
  });
});
