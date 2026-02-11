import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createEpicTools } from "../../../src/plugins/builtin/tools/epics.js";
import { createFeatureTools } from "../../../src/plugins/builtin/tools/features.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("Epic Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let epicTools: Record<string, (args: any) => Promise<any>>;
  let featureTools: Record<string, (args: any) => Promise<any>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "meetings", "reports", "features", "epics"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    epicTools = {};
    for (const t of createEpicTools(store)) {
      epicTools[t.name] = (t as any).handler;
    }
    featureTools = {};
    for (const t of createFeatureTools(store)) {
      featureTools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("create_epic hard validation", () => {
    it("should reject when linked feature does not exist", async () => {
      const result = await epicTools.create_epic({
        title: "Auth Epic",
        content: "Implement auth.",
        linkedFeature: "F-999",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("should reject when linked ID is not a feature type", async () => {
      // Create a decision (D-001) instead of a feature
      store.create("decision", { title: "Some Decision" }, "Content");

      const result = await epicTools.create_epic({
        title: "Auth Epic",
        content: "Implement auth.",
        linkedFeature: "D-001",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not a feature");
    });

    it("should reject when feature is draft", async () => {
      await featureTools.create_feature({
        title: "Auth Feature",
        content: "OAuth2 login.",
      });

      const result = await epicTools.create_epic({
        title: "Auth Epic",
        content: "Implement auth.",
        linkedFeature: "F-001",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("approved");
      expect(result.content[0].text).toContain("draft");
    });

    it("should reject when feature is deferred", async () => {
      await featureTools.create_feature({
        title: "Auth Feature",
        content: "OAuth2 login.",
        status: "deferred",
      });

      const result = await epicTools.create_epic({
        title: "Auth Epic",
        content: "Implement auth.",
        linkedFeature: "F-001",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("approved");
    });

    it("should succeed when feature is approved", async () => {
      await featureTools.create_feature({
        title: "Auth Feature",
        content: "OAuth2 login.",
        status: "approved",
      });

      const result = await epicTools.create_epic({
        title: "Auth Epic",
        content: "Implement OAuth2.",
        linkedFeature: "F-001",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("E-001");
      expect(result.content[0].text).toContain("linked to F-001");

      const doc = store.get("E-001");
      expect(doc).toBeDefined();
      expect(doc!.frontmatter.type).toBe("epic");
      expect(doc!.frontmatter.linkedFeature).toBe("F-001");
      expect(doc!.frontmatter.tags).toContain("feature:F-001");
      expect(doc!.frontmatter.status).toBe("planned");
    });

    it("should preserve optional fields", async () => {
      await featureTools.create_feature({
        title: "Auth Feature",
        content: "OAuth2.",
        status: "approved",
      });

      await epicTools.create_epic({
        title: "Auth Epic",
        content: "Implement auth.",
        linkedFeature: "F-001",
        owner: "alice",
        targetDate: "2026-03-01",
        estimatedEffort: "2 weeks",
        tags: ["sprint-1"],
      });

      const doc = store.get("E-001");
      expect(doc!.frontmatter.owner).toBe("alice");
      expect(doc!.frontmatter.targetDate).toBe("2026-03-01");
      expect(doc!.frontmatter.estimatedEffort).toBe("2 weeks");
      expect(doc!.frontmatter.tags).toContain("feature:F-001");
      expect(doc!.frontmatter.tags).toContain("sprint-1");
    });
  });

  describe("list_epics", () => {
    beforeEach(async () => {
      await featureTools.create_feature({
        title: "Feature A",
        content: "A",
        status: "approved",
      });
      await featureTools.create_feature({
        title: "Feature B",
        content: "B",
        status: "approved",
      });
      await epicTools.create_epic({
        title: "Epic 1",
        content: "E1",
        linkedFeature: "F-001",
      });
      await epicTools.create_epic({
        title: "Epic 2",
        content: "E2",
        linkedFeature: "F-001",
        status: "in-progress",
      });
      await epicTools.create_epic({
        title: "Epic 3",
        content: "E3",
        linkedFeature: "F-002",
      });
    });

    it("should list all epics", async () => {
      const result = await epicTools.list_epics({});
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(3);
    });

    it("should filter by status", async () => {
      const result = await epicTools.list_epics({ status: "planned" });
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(2);
    });

    it("should filter by linkedFeature", async () => {
      const result = await epicTools.list_epics({ linkedFeature: "F-001" });
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(2);
    });
  });

  describe("update_epic", () => {
    it("should update epic status and targetDate", async () => {
      await featureTools.create_feature({
        title: "Feature",
        content: "F",
        status: "approved",
      });
      await epicTools.create_epic({
        title: "Epic",
        content: "E",
        linkedFeature: "F-001",
      });

      const result = await epicTools.update_epic({
        id: "E-001",
        status: "in-progress",
        targetDate: "2026-04-01",
      });
      expect(result.content[0].text).toContain("Updated epic E-001");

      const doc = store.get("E-001");
      expect(doc!.frontmatter.status).toBe("in-progress");
      expect(doc!.frontmatter.targetDate).toBe("2026-04-01");
    });
  });

  it("should return error for non-existent epic", async () => {
    const result = await epicTools.get_epic({ id: "E-999" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });
});
