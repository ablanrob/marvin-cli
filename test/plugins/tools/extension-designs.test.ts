import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createUseCaseTools } from "../../../src/plugins/builtin/tools/use-cases.js";
import { createTechAssessmentTools } from "../../../src/plugins/builtin/tools/tech-assessments.js";
import { createExtensionDesignTools } from "../../../src/plugins/builtin/tools/extension-designs.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";
import type { DocumentTypeRegistration } from "../../../src/storage/types.js";

const AEM_REGISTRATIONS: DocumentTypeRegistration[] = [
  ...COMMON_REGISTRATIONS,
  { type: "use-case", dirName: "use-cases", idPrefix: "UC" },
  { type: "tech-assessment", dirName: "tech-assessments", idPrefix: "TA" },
  { type: "extension-design", dirName: "extension-designs", idPrefix: "XD" },
];

describe("Extension Design Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let ucTools: Record<string, (args: any) => Promise<any>>;
  let taTools: Record<string, (args: any) => Promise<any>>;
  let xdTools: Record<string, (args: any) => Promise<any>>;

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
    xdTools = {};
    for (const t of createExtensionDesignTools(store)) {
      xdTools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("create_extension_design validation", () => {
    it("should reject when linked tech assessment does not exist", async () => {
      const result = await xdTools.create_extension_design({
        title: "Design",
        content: "Architecture.",
        linkedTechAssessment: "TA-999",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("should reject when linked ID is not a tech-assessment type", async () => {
      store.create("decision", { title: "Some Decision" }, "Content");

      const result = await xdTools.create_extension_design({
        title: "Design",
        content: "Architecture.",
        linkedTechAssessment: "D-001",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not a tech-assessment");
    });

    it("should reject when tech assessment is draft", async () => {
      await ucTools.create_use_case({ title: "UC", content: "C", status: "assessed" });
      await taTools.create_tech_assessment({ title: "TA", content: "T", linkedUseCase: "UC-001" });

      const result = await xdTools.create_extension_design({
        title: "Design",
        content: "Architecture.",
        linkedTechAssessment: "TA-001",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("recommended");
    });

    it("should succeed when tech assessment is recommended", async () => {
      await ucTools.create_use_case({ title: "UC", content: "C", status: "assessed" });
      await taTools.create_tech_assessment({
        title: "TA", content: "T", linkedUseCase: "UC-001", status: "recommended",
      });

      const result = await xdTools.create_extension_design({
        title: "Event-Driven Extension",
        content: "Architecture using SAP Event Mesh.",
        linkedTechAssessment: "TA-001",
        architecture: "event-driven",
        btpServices: ["SAP Event Mesh"],
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("XD-001");
      expect(result.content[0].text).toContain("linked to TA-001");

      const doc = store.get("XD-001");
      expect(doc).toBeDefined();
      expect(doc!.frontmatter.type).toBe("extension-design");
      expect(doc!.frontmatter.linkedTechAssessment).toBe("TA-001");
      expect(doc!.frontmatter.architecture).toBe("event-driven");
      expect(doc!.frontmatter.tags).toContain("tech-assessment:TA-001");
    });
  });

  describe("list_extension_designs", () => {
    beforeEach(async () => {
      await ucTools.create_use_case({ title: "UC", content: "C", status: "assessed" });
      await taTools.create_tech_assessment({
        title: "TA 1", content: "T1", linkedUseCase: "UC-001", status: "recommended",
      });
      await taTools.create_tech_assessment({
        title: "TA 2", content: "T2", linkedUseCase: "UC-001", status: "recommended",
      });

      await xdTools.create_extension_design({
        title: "XD 1", content: "D1", linkedTechAssessment: "TA-001",
      });
      await xdTools.create_extension_design({
        title: "XD 2", content: "D2", linkedTechAssessment: "TA-001", status: "designed",
      });
      await xdTools.create_extension_design({
        title: "XD 3", content: "D3", linkedTechAssessment: "TA-002",
      });
    });

    it("should list all extension designs", async () => {
      const result = await xdTools.list_extension_designs({});
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(3);
    });

    it("should filter by linkedTechAssessment", async () => {
      const result = await xdTools.list_extension_designs({ linkedTechAssessment: "TA-001" });
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(2);
    });
  });

  it("should update extension design status", async () => {
    await ucTools.create_use_case({ title: "UC", content: "C", status: "assessed" });
    await taTools.create_tech_assessment({
      title: "TA", content: "T", linkedUseCase: "UC-001", status: "recommended",
    });
    await xdTools.create_extension_design({
      title: "XD", content: "D", linkedTechAssessment: "TA-001",
    });

    const result = await xdTools.update_extension_design({ id: "XD-001", status: "validated" });
    expect(result.content[0].text).toContain("Updated extension design XD-001");

    const doc = store.get("XD-001");
    expect(doc!.frontmatter.status).toBe("validated");
  });

  it("should return error for non-existent extension design", async () => {
    const result = await xdTools.get_extension_design({ id: "XD-999" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });
});
