import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import type { DocumentTypeRegistration } from "../../../src/storage/types.js";
import { buildDoctorContext } from "../../../src/doctor/engine.js";
import { orphanedReferencesRule } from "../../../src/doctor/rules/orphaned-references.js";

const REGISTRATIONS: DocumentTypeRegistration[] = [
  { type: "epic", dirName: "epics", idPrefix: "E" },
  { type: "task", dirName: "tasks", idPrefix: "T" },
  { type: "feature", dirName: "features", idPrefix: "F" },
];

function setupStore(): { store: DocumentStore; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-doctor-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  for (const dir of ["decisions", "actions", "questions", "epics", "tasks", "features"]) {
    fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
  }
  return { store: new DocumentStore(marvinDir, REGISTRATIONS), tmpDir };
}

describe("orphaned-references rule", () => {
  let store: DocumentStore;
  let tmpDir: string;

  beforeEach(() => {
    ({ store, tmpDir } = setupStore());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should detect aboutArtifact referencing non-existent document", () => {
    store.create("action", {
      title: "A1",
      aboutArtifact: "D-999",
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = orphanedReferencesRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("D-999");
    expect(issues[0].fixable).toBe(false);
  });

  it("should detect linkedEpic referencing non-existent epic", () => {
    store.create("task", {
      title: "T1",
      linkedEpic: ["E-999"],
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = orphanedReferencesRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("E-999");
  });

  it("should detect linkedFeature referencing non-existent feature", () => {
    store.create("epic", {
      title: "E1",
      linkedFeature: ["F-999"],
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = orphanedReferencesRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("F-999");
  });

  it("should not flag valid references", () => {
    store.create("decision", { title: "D1" });
    store.create("action", {
      title: "A1",
      aboutArtifact: "D-001",
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = orphanedReferencesRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should not flag documents without reference fields", () => {
    store.create("action", { title: "A1" });
    const ctx = buildDoctorContext(store);
    const issues = orphanedReferencesRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should handle string-valued reference fields", () => {
    store.create("task", {
      title: "T1",
      linkedEpic: "E-999",
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = orphanedReferencesRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("E-999");
  });

  it("should return no fixes (not auto-fixable)", () => {
    store.create("action", {
      title: "A1",
      aboutArtifact: "D-999",
    } as any);
    const ctx = buildDoctorContext(store);
    const fixes = orphanedReferencesRule.fix(ctx);
    expect(fixes).toHaveLength(0);
  });
});
