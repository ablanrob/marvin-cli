import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import { DocumentStore } from "../../../src/storage/store.js";
import { phaseReadinessCheck } from "../../../src/doctor/health/checks/phase-readiness.js";
import type { HealthContext } from "../../../src/doctor/health/types.js";
import type { MarvinProjectConfig } from "../../../src/core/config.js";

function setup(phase?: string) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-phase-test-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  const docsDir = path.join(marvinDir, "docs");
  fs.mkdirSync(docsDir, { recursive: true });

  const projectConfig: Record<string, unknown> = {
    name: "test-project",
    methodology: "sap-aem",
  };
  if (phase) {
    projectConfig.aem = { currentPhase: phase };
  }
  fs.writeFileSync(path.join(marvinDir, "config.yaml"), YAML.stringify(projectConfig), "utf-8");

  const config: MarvinProjectConfig = {
    name: "test-project",
    methodology: "sap-aem",
  };

  const registrations = [
    { type: "use-case", dirName: "use-cases", idPrefix: "UC" },
    { type: "tech-assessment", dirName: "tech-assessments", idPrefix: "TA" },
    { type: "extension-design", dirName: "extension-designs", idPrefix: "XD" },
  ];

  const store = new DocumentStore(marvinDir, registrations);
  const ctx: HealthContext = { store, config, marvinDir };
  return { tmpDir, store, ctx };
}

describe("Phase Readiness Check", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should skip for non-AEM projects", () => {
    const env = setup("assess-use-case");
    tmpDir = env.tmpDir;

    const ctx = { ...env.ctx, config: { name: "test", methodology: "scrum" } };
    const findings = phaseReadinessCheck.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it("should flag no use cases in Phase 1", () => {
    const env = setup("assess-use-case");
    tmpDir = env.tmpDir;

    const findings = phaseReadinessCheck.run(env.ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("no use cases");
  });

  it("should flag all-draft use cases in Phase 1", () => {
    const env = setup("assess-use-case");
    tmpDir = env.tmpDir;

    env.store.create("use-case", { title: "UC1", status: "draft" });
    env.store.create("use-case", { title: "UC2", status: "draft" });

    const findings = phaseReadinessCheck.run(env.ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("2 use case(s) are still in draft");
  });

  it("should not flag when use cases are assessed", () => {
    const env = setup("assess-use-case");
    tmpDir = env.tmpDir;

    env.store.create("use-case", { title: "UC1", status: "assessed" });
    env.store.create("use-case", { title: "UC2", status: "draft" });

    const findings = phaseReadinessCheck.run(env.ctx);
    expect(findings).toHaveLength(0);
  });

  it("should flag no tech assessments in Phase 2 with approved use cases", () => {
    const env = setup("assess-technology");
    tmpDir = env.tmpDir;

    env.store.create("use-case", { title: "UC1", status: "approved" });

    const findings = phaseReadinessCheck.run(env.ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("no tech assessments");
  });

  it("should flag no extension designs in Phase 3 with recommended assessments", () => {
    const env = setup("define-solution");
    tmpDir = env.tmpDir;

    env.store.create("tech-assessment", { title: "TA1", status: "recommended" });

    const findings = phaseReadinessCheck.run(env.ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("no extension designs");
  });

  it("should return no findings when phase is not set", () => {
    const env = setup();
    tmpDir = env.tmpDir;

    const findings = phaseReadinessCheck.run(env.ctx);
    expect(findings).toHaveLength(0);
  });
});
