import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createUseCaseTools } from "../../../src/plugins/builtin/tools/use-cases.js";
import { createTechAssessmentTools } from "../../../src/plugins/builtin/tools/tech-assessments.js";
import { createExtensionDesignTools } from "../../../src/plugins/builtin/tools/extension-designs.js";
import { createAemReportTools } from "../../../src/plugins/builtin/tools/aem-reports.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";
import type { DocumentTypeRegistration } from "../../../src/storage/types.js";

const AEM_REGISTRATIONS: DocumentTypeRegistration[] = [
  ...COMMON_REGISTRATIONS,
  { type: "use-case", dirName: "use-cases", idPrefix: "UC" },
  { type: "tech-assessment", dirName: "tech-assessments", idPrefix: "TA" },
  { type: "extension-design", dirName: "extension-designs", idPrefix: "XD" },
];

describe("AEM Report Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let ucTools: Record<string, (args: any) => Promise<any>>;
  let taTools: Record<string, (args: any) => Promise<any>>;
  let xdTools: Record<string, (args: any) => Promise<any>>;
  let reportTools: Record<string, (args: any) => Promise<any>>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "meetings", "reports", "features", "epics", "use-cases", "tech-assessments", "extension-designs"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, AEM_REGISTRATIONS);

    ucTools = {};
    for (const t of createUseCaseTools(store)) ucTools[t.name] = (t as any).handler;
    taTools = {};
    for (const t of createTechAssessmentTools(store)) taTools[t.name] = (t as any).handler;
    xdTools = {};
    for (const t of createExtensionDesignTools(store)) xdTools[t.name] = (t as any).handler;
    reportTools = {};
    for (const t of createAemReportTools(store)) reportTools[t.name] = (t as any).handler;

    // Seed data
    await ucTools.create_use_case({ title: "UC A", content: "A", status: "assessed", extensionType: "in-app" });
    await ucTools.create_use_case({ title: "UC B", content: "B", status: "approved", extensionType: "side-by-side" });
    await ucTools.create_use_case({ title: "UC C", content: "C", status: "draft" });

    await taTools.create_tech_assessment({
      title: "TA 1", content: "T1", linkedUseCase: "UC-001",
      btpServices: ["SAP Event Mesh", "SAP Integration Suite"],
      status: "recommended",
    });
    await taTools.create_tech_assessment({
      title: "TA 2", content: "T2", linkedUseCase: "UC-002",
      btpServices: ["SAP Build Work Zone"],
    });

    await xdTools.create_extension_design({
      title: "XD 1", content: "D1", linkedTechAssessment: "TA-001",
      architecture: "event-driven",
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should generate extension portfolio", async () => {
    const result = await reportTools.generate_extension_portfolio({});
    const data = JSON.parse(result.content[0].text);

    expect(data.portfolio).toHaveLength(3);
    expect(data.summary.useCases).toBe(3);
    expect(data.summary.techAssessments).toBe(2);
    expect(data.summary.extensionDesigns).toBe(1);

    // UC A should have 1 TA and 1 XD
    const ucA = data.portfolio.find((p: any) => p.useCase.id === "UC-001");
    expect(ucA.techAssessments).toHaveLength(1);
    expect(ucA.extensionDesigns).toHaveLength(1);

    // UC C (draft) should have no TAs or XDs
    const ucC = data.portfolio.find((p: any) => p.useCase.id === "UC-003");
    expect(ucC.techAssessments).toHaveLength(0);
    expect(ucC.extensionDesigns).toHaveLength(0);
  });

  it("should generate tech readiness report", async () => {
    const result = await reportTools.generate_tech_readiness({});
    const data = JSON.parse(result.content[0].text);

    expect(data.btpServices).toHaveLength(3);
    expect(data.summary.totalServices).toBe(3);
    expect(data.summary.totalAssessments).toBe(2);

    // UC C has no tech assessment
    expect(data.unassessedUseCases).toHaveLength(1);
    expect(data.unassessedUseCases[0].id).toBe("UC-003");
  });

  it("should generate phase status report", async () => {
    const result = await reportTools.generate_phase_status({});
    const data = JSON.parse(result.content[0].text);

    // Phase 1: UC C is still draft, so gate not ready
    expect(data.phases["assess-use-case"].total).toBe(3);
    expect(data.phases["assess-use-case"].gateReady).toBe(false);

    // Phase 2: TA-2 is still draft
    expect(data.phases["assess-technology"].total).toBe(2);
    expect(data.phases["assess-technology"].gateReady).toBe(false);

    // Phase 3: XD-1 is draft
    expect(data.phases["define-solution"].total).toBe(1);
    expect(data.phases["define-solution"].gateReady).toBe(false);
  });
});
