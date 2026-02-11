import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createUseCaseTools } from "../../../src/plugins/builtin/tools/use-cases.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";
import type { DocumentTypeRegistration } from "../../../src/storage/types.js";

const AEM_REGISTRATIONS: DocumentTypeRegistration[] = [
  ...COMMON_REGISTRATIONS,
  { type: "use-case", dirName: "use-cases", idPrefix: "UC" },
  { type: "tech-assessment", dirName: "tech-assessments", idPrefix: "TA" },
  { type: "extension-design", dirName: "extension-designs", idPrefix: "XD" },
];

describe("Use Case Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let tools: Record<string, (args: any) => Promise<any>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "meetings", "reports", "features", "epics", "use-cases", "tech-assessments", "extension-designs"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, AEM_REGISTRATIONS);

    const ucTools = createUseCaseTools(store);
    tools = {};
    for (const t of ucTools) {
      tools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create a use case with default draft status", async () => {
    const result = await tools.create_use_case({
      title: "Extend Sales Order",
      content: "Need custom fields on sales order for regional compliance.",
    });
    expect(result.content[0].text).toContain("UC-001");
    expect(result.content[0].text).toContain("Extend Sales Order");

    const doc = store.get("UC-001");
    expect(doc).toBeDefined();
    expect(doc!.frontmatter.type).toBe("use-case");
    expect(doc!.frontmatter.status).toBe("draft");
  });

  it("should create a use case with all optional fields", async () => {
    await tools.create_use_case({
      title: "Custom Approval Workflow",
      content: "Side-by-side extension for approval routing.",
      businessProcess: "Procure-to-Pay",
      extensionType: "side-by-side",
      priority: "high",
      owner: "alice",
      tags: ["procurement"],
    });

    const doc = store.get("UC-001");
    expect(doc!.frontmatter.businessProcess).toBe("Procure-to-Pay");
    expect(doc!.frontmatter.extensionType).toBe("side-by-side");
    expect(doc!.frontmatter.priority).toBe("high");
    expect(doc!.frontmatter.owner).toBe("alice");
    expect(doc!.frontmatter.tags).toContain("procurement");
  });

  it("should list use cases and filter by status", async () => {
    await tools.create_use_case({ title: "UC A", content: "A" });
    await tools.create_use_case({ title: "UC B", content: "B", status: "assessed" });
    await tools.create_use_case({ title: "UC C", content: "C", status: "assessed" });

    const allResult = await tools.list_use_cases({});
    const all = JSON.parse(allResult.content[0].text);
    expect(all).toHaveLength(3);

    const assessedResult = await tools.list_use_cases({ status: "assessed" });
    const assessed = JSON.parse(assessedResult.content[0].text);
    expect(assessed).toHaveLength(2);
  });

  it("should filter use cases by extension type", async () => {
    await tools.create_use_case({ title: "UC A", content: "A", extensionType: "in-app" });
    await tools.create_use_case({ title: "UC B", content: "B", extensionType: "side-by-side" });
    await tools.create_use_case({ title: "UC C", content: "C", extensionType: "in-app" });

    const result = await tools.list_use_cases({ extensionType: "in-app" });
    const list = JSON.parse(result.content[0].text);
    expect(list).toHaveLength(2);
  });

  it("should get a use case by ID", async () => {
    await tools.create_use_case({ title: "My UC", content: "Details here." });

    const result = await tools.get_use_case({ id: "UC-001" });
    const data = JSON.parse(result.content[0].text);
    expect(data.title).toBe("My UC");
    expect(data.content).toContain("Details here");
  });

  it("should return error for non-existent use case", async () => {
    const result = await tools.get_use_case({ id: "UC-999" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("should update use case status", async () => {
    await tools.create_use_case({ title: "My UC", content: "Draft." });

    const result = await tools.update_use_case({ id: "UC-001", status: "assessed" });
    expect(result.content[0].text).toContain("Updated use case UC-001");

    const doc = store.get("UC-001");
    expect(doc!.frontmatter.status).toBe("assessed");
  });
});
