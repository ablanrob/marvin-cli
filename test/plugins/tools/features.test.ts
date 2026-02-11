import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createFeatureTools } from "../../../src/plugins/builtin/tools/features.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("Feature Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let tools: Record<string, (args: any) => Promise<any>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "meetings", "reports", "features", "epics"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    const featureTools = createFeatureTools(store);
    tools = {};
    for (const t of featureTools) {
      tools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create a feature with default draft status", async () => {
    const result = await tools.create_feature({
      title: "User Authentication",
      content: "Implement OAuth2 login flow.",
    });
    expect(result.content[0].text).toContain("F-001");
    expect(result.content[0].text).toContain("User Authentication");

    const doc = store.get("F-001");
    expect(doc).toBeDefined();
    expect(doc!.frontmatter.id).toBe("F-001");
    expect(doc!.frontmatter.type).toBe("feature");
    expect(doc!.frontmatter.status).toBe("draft");
    expect(doc!.content).toContain("OAuth2");
  });

  it("should list features and filter by status", async () => {
    await tools.create_feature({ title: "Feature A", content: "A" });
    await tools.create_feature({ title: "Feature B", content: "B", status: "approved" });
    await tools.create_feature({ title: "Feature C", content: "C", status: "approved" });

    const allResult = await tools.list_features({});
    const all = JSON.parse(allResult.content[0].text);
    expect(all).toHaveLength(3);

    const approvedResult = await tools.list_features({ status: "approved" });
    const approved = JSON.parse(approvedResult.content[0].text);
    expect(approved).toHaveLength(2);
  });

  it("should get a feature by ID", async () => {
    await tools.create_feature({ title: "My Feature", content: "Details here." });

    const result = await tools.get_feature({ id: "F-001" });
    const data = JSON.parse(result.content[0].text);
    expect(data.title).toBe("My Feature");
    expect(data.content).toContain("Details here");
  });

  it("should return error for non-existent feature", async () => {
    const result = await tools.get_feature({ id: "F-999" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("should update feature status from draft to approved", async () => {
    await tools.create_feature({ title: "My Feature", content: "Draft." });

    const result = await tools.update_feature({ id: "F-001", status: "approved" });
    expect(result.content[0].text).toContain("Updated feature F-001");

    const doc = store.get("F-001");
    expect(doc!.frontmatter.status).toBe("approved");
  });
});
