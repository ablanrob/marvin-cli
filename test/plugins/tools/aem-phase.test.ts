import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import { DocumentStore } from "../../../src/storage/store.js";
import { createUseCaseTools } from "../../../src/plugins/builtin/tools/use-cases.js";
import { createTechAssessmentTools } from "../../../src/plugins/builtin/tools/tech-assessments.js";
import { createAemPhaseTools } from "../../../src/plugins/builtin/tools/aem-phase.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";
import type { DocumentTypeRegistration } from "../../../src/storage/types.js";

const AEM_REGISTRATIONS: DocumentTypeRegistration[] = [
  ...COMMON_REGISTRATIONS,
  { type: "use-case", dirName: "use-cases", idPrefix: "UC" },
  { type: "tech-assessment", dirName: "tech-assessments", idPrefix: "TA" },
  { type: "extension-design", dirName: "extension-designs", idPrefix: "XD" },
];

describe("AEM Phase Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let phaseTools: Record<string, (args: any) => Promise<any>>;
  let ucTools: Record<string, (args: any) => Promise<any>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "meetings", "reports", "features", "epics", "use-cases", "tech-assessments", "extension-designs"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }

    // Create config with AEM phase
    const config = {
      name: "test-project",
      methodology: "sap-aem",
      aem: { currentPhase: "assess-use-case" },
    };
    fs.writeFileSync(path.join(marvinDir, "config.yaml"), YAML.stringify(config), "utf-8");

    store = new DocumentStore(marvinDir, AEM_REGISTRATIONS);

    phaseTools = {};
    for (const t of createAemPhaseTools(store, marvinDir)) {
      phaseTools[t.name] = (t as any).handler;
    }
    ucTools = {};
    for (const t of createUseCaseTools(store)) {
      ucTools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should get current phase", async () => {
    const result = await phaseTools.get_current_phase({});
    const data = JSON.parse(result.content[0].text);
    expect(data.currentPhase).toBe("assess-use-case");
    expect(data.description).toContain("Phase 1");
  });

  it("should advance to next phase", async () => {
    const result = await phaseTools.advance_phase({});
    const data = JSON.parse(result.content[0].text);

    expect(data.previousPhase).toBe("assess-use-case");
    expect(data.currentPhase).toBe("assess-technology");

    // Verify config was updated
    const raw = fs.readFileSync(path.join(marvinDir, "config.yaml"), "utf-8");
    const config = YAML.parse(raw) as Record<string, any>;
    expect(config.aem.currentPhase).toBe("assess-technology");
  });

  it("should warn about draft use cases when advancing from phase 1", async () => {
    await ucTools.create_use_case({ title: "Draft UC", content: "Still draft." });

    const result = await phaseTools.advance_phase({});
    const data = JSON.parse(result.content[0].text);

    expect(data.warnings).toBeDefined();
    expect(data.warnings.length).toBeGreaterThan(0);
    expect(data.warnings[0]).toContain("draft");
  });

  it("should warn when no use cases exist", async () => {
    const result = await phaseTools.advance_phase({});
    const data = JSON.parse(result.content[0].text);

    expect(data.warnings).toBeDefined();
    expect(data.warnings[0]).toContain("No use cases");
  });

  it("should prevent moving backward", async () => {
    // Advance to phase 2 first
    await phaseTools.advance_phase({});

    const result = await phaseTools.advance_phase({ targetPhase: "assess-use-case" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Cannot move backward");
  });

  it("should prevent advancing past final phase", async () => {
    // Advance to phase 3
    await phaseTools.advance_phase({});
    await phaseTools.advance_phase({});

    const result = await phaseTools.advance_phase({});
    expect(result.content[0].text).toContain("final phase");
  });

  it("should allow advancing to specific target phase", async () => {
    const result = await phaseTools.advance_phase({ targetPhase: "define-solution" });
    const data = JSON.parse(result.content[0].text);

    expect(data.previousPhase).toBe("assess-use-case");
    expect(data.currentPhase).toBe("define-solution");
  });
});
