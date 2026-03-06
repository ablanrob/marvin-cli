import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { buildDoctorContext } from "../../../src/doctor/engine.js";
import { progressConsistencyRule } from "../../../src/doctor/rules/progress-consistency.js";

function setupStore(): { store: DocumentStore; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-doctor-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  for (const dir of ["decisions", "actions", "questions"]) {
    fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
  }
  return { store: new DocumentStore(marvinDir), tmpDir };
}

describe("progress-consistency rule", () => {
  let store: DocumentStore;
  let tmpDir: string;

  beforeEach(() => {
    ({ store, tmpDir } = setupStore());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should detect done status with progress != 100", () => {
    store.create("action", {
      title: "A1",
      status: "done",
      progress: 50,
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = progressConsistencyRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("50");
  });

  it("should detect progressOverride:true without progress", () => {
    store.create("action", {
      title: "A1",
      status: "in-progress",
      progressOverride: true,
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = progressConsistencyRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].message).toContain("progressOverride");
  });

  it("should not flag done with progress 100", () => {
    store.create("action", {
      title: "A1",
      status: "done",
      progress: 100,
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = progressConsistencyRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should not flag progressOverride:true with progress set", () => {
    store.create("action", {
      title: "A1",
      status: "in-progress",
      progressOverride: true,
      progress: 75,
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = progressConsistencyRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should not flag done without progress field at all", () => {
    store.create("action", { title: "A1", status: "done" });
    const ctx = buildDoctorContext(store);
    const issues = progressConsistencyRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should fix done progress to 100", () => {
    store.create("action", {
      title: "A1",
      status: "done",
      progress: 30,
    } as any);
    const ctx = buildDoctorContext(store);
    const fixes = progressConsistencyRule.fix(ctx);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].fixDescription).toContain("100");

    const doc = store.get("A-001")!;
    expect((doc.frontmatter as any).progress).toBe(100);
  });

  it("should fix progressOverride to false when no progress", () => {
    store.create("action", {
      title: "A1",
      status: "in-progress",
      progressOverride: true,
    } as any);
    const ctx = buildDoctorContext(store);
    const fixes = progressConsistencyRule.fix(ctx);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].fixDescription).toContain("false");

    const doc = store.get("A-001")!;
    expect((doc.frontmatter as any).progressOverride).toBe(false);
  });
});
