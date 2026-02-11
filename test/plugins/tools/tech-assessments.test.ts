import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createUseCaseTools } from "../../../src/plugins/builtin/tools/use-cases.js";
import { createTechAssessmentTools } from "../../../src/plugins/builtin/tools/tech-assessments.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";
import type { DocumentTypeRegistration } from "../../../src/storage/types.js";

const AEM_REGISTRATIONS: DocumentTypeRegistration[] = [
  ...COMMON_REGISTRATIONS,
  { type: "use-case", dirName: "use-cases", idPrefix: "UC" },
  { type: "tech-assessment", dirName: "tech-assessments", idPrefix: "TA" },
  { type: "extension-design", dirName: "extension-designs", idPrefix: "XD" },
];

describe("Tech Assessment Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let ucTools: Record<string, (args: any) => Promise<any>>;
  let taTools: Record<string, (args: any) => Promise<any>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "meetings", "reports", "features", "epics", "use-cases", "tech-assessments", "extension-designs"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, AEM_REGISTRATIONS);

    ucTools = {};
    for (const t of createUseCaseTools(store)) {
      ucTools[t.name] = (t as any).handler;
    }
    taTools = {};
    for (const t of createTechAssessmentTools(store)) {
      taTools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("create_tech_assessment validation", () => {
    it("should reject when linked use case does not exist", async () => {
      const result = await taTools.create_tech_assessment({
        title: "BTP Eval",
        content: "Evaluate services.",
        linkedUseCase: "UC-999",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("should reject when linked ID is not a use-case type", async () => {
      store.create("decision", { title: "Some Decision" }, "Content");

      const result = await taTools.create_tech_assessment({
        title: "BTP Eval",
        content: "Evaluate services.",
        linkedUseCase: "D-001",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not a use-case");
    });

    it("should reject when use case is draft", async () => {
      await ucTools.create_use_case({ title: "My UC", content: "Draft UC." });

      const result = await taTools.create_tech_assessment({
        title: "BTP Eval",
        content: "Evaluate services.",
        linkedUseCase: "UC-001",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("assessed or approved");
    });

    it("should succeed when use case is assessed", async () => {
      await ucTools.create_use_case({
        title: "My UC",
        content: "UC content.",
        status: "assessed",
      });

      const result = await taTools.create_tech_assessment({
        title: "BTP Eval",
        content: "SAP Event Mesh analysis.",
        linkedUseCase: "UC-001",
        btpServices: ["SAP Event Mesh", "SAP Integration Suite"],
        extensionPoint: "Business Events",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("TA-001");
      expect(result.content[0].text).toContain("linked to UC-001");

      const doc = store.get("TA-001");
      expect(doc).toBeDefined();
      expect(doc!.frontmatter.type).toBe("tech-assessment");
      expect(doc!.frontmatter.linkedUseCase).toBe("UC-001");
      expect(doc!.frontmatter.btpServices).toEqual(["SAP Event Mesh", "SAP Integration Suite"]);
      expect(doc!.frontmatter.tags).toContain("use-case:UC-001");
    });

    it("should succeed when use case is approved", async () => {
      await ucTools.create_use_case({
        title: "Approved UC",
        content: "UC content.",
        status: "approved",
      });

      const result = await taTools.create_tech_assessment({
        title: "BTP Eval",
        content: "Analysis.",
        linkedUseCase: "UC-001",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("TA-001");
    });
  });

  describe("list_tech_assessments", () => {
    beforeEach(async () => {
      await ucTools.create_use_case({ title: "UC A", content: "A", status: "assessed" });
      await ucTools.create_use_case({ title: "UC B", content: "B", status: "approved" });

      await taTools.create_tech_assessment({
        title: "TA 1", content: "T1", linkedUseCase: "UC-001",
      });
      await taTools.create_tech_assessment({
        title: "TA 2", content: "T2", linkedUseCase: "UC-001", status: "recommended",
      });
      await taTools.create_tech_assessment({
        title: "TA 3", content: "T3", linkedUseCase: "UC-002",
      });
    });

    it("should list all tech assessments", async () => {
      const result = await taTools.list_tech_assessments({});
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(3);
    });

    it("should filter by status", async () => {
      const result = await taTools.list_tech_assessments({ status: "draft" });
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(2);
    });

    it("should filter by linkedUseCase", async () => {
      const result = await taTools.list_tech_assessments({ linkedUseCase: "UC-001" });
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(2);
    });
  });

  it("should update tech assessment status", async () => {
    await ucTools.create_use_case({ title: "UC", content: "C", status: "assessed" });
    await taTools.create_tech_assessment({ title: "TA", content: "T", linkedUseCase: "UC-001" });

    const result = await taTools.update_tech_assessment({ id: "TA-001", status: "recommended" });
    expect(result.content[0].text).toContain("Updated tech assessment TA-001");

    const doc = store.get("TA-001");
    expect(doc!.frontmatter.status).toBe("recommended");
  });

  it("should return error for non-existent tech assessment", async () => {
    const result = await taTools.get_tech_assessment({ id: "TA-999" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });
});
