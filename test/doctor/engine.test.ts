import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../src/storage/store.js";
import type { DocumentTypeRegistration } from "../../src/storage/types.js";
import { runDoctorScan, runDoctorFix, buildDoctorContext } from "../../src/doctor/engine.js";

const REGISTRATIONS: DocumentTypeRegistration[] = [
  { type: "meeting", dirName: "meetings", idPrefix: "M" },
  { type: "report", dirName: "reports", idPrefix: "R" },
  { type: "feature", dirName: "features", idPrefix: "F" },
  { type: "epic", dirName: "epics", idPrefix: "E" },
  { type: "task", dirName: "tasks", idPrefix: "T" },
];

function setupStore(): { store: DocumentStore; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-doctor-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  for (const reg of REGISTRATIONS) {
    fs.mkdirSync(path.join(marvinDir, "docs", reg.dirName), { recursive: true });
  }
  for (const dir of ["decisions", "actions", "questions"]) {
    fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
  }
  const store = new DocumentStore(marvinDir, REGISTRATIONS);
  return { store, tmpDir };
}

describe("buildDoctorContext", () => {
  let store: DocumentStore;
  let tmpDir: string;

  beforeEach(() => {
    ({ store, tmpDir } = setupStore());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should build context with all documents indexed", () => {
    store.create("decision", { title: "D1" });
    store.create("action", { title: "A1" });

    const ctx = buildDoctorContext(store);
    expect(ctx.allDocuments).toHaveLength(2);
    expect(ctx.documentIndex.has("D-001")).toBe(true);
    expect(ctx.documentIndex.has("A-001")).toBe(true);
  });
});

describe("runDoctorScan", () => {
  let store: DocumentStore;
  let tmpDir: string;

  beforeEach(() => {
    ({ store, tmpDir } = setupStore());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return clean report for healthy documents", () => {
    store.create("decision", { title: "D1", tags: ["focus:backend"] });

    const report = runDoctorScan(store);
    expect(report.totalDocuments).toBe(1);
    expect(report.summary.totalIssues).toBe(0);
  });

  it("should detect issues across multiple rules", () => {
    store.create("action", {
      title: "A1",
      tags: ["stream:backend"],
      status: "done",
      progress: 50,
    } as any);

    const report = runDoctorScan(store);
    expect(report.summary.totalIssues).toBeGreaterThanOrEqual(2);
    expect(report.summary.byRule["tag-migration"]).toBe(1);
    expect(report.summary.byRule["progress-consistency"]).toBe(1);
  });

  it("should filter by specific rule", () => {
    store.create("action", {
      title: "A1",
      tags: ["stream:backend"],
      status: "done",
      progress: 50,
    } as any);

    const report = runDoctorScan(store, "tag-migration");
    expect(report.summary.totalIssues).toBe(1);
    expect(report.summary.byRule["tag-migration"]).toBe(1);
    expect(report.summary.byRule["progress-consistency"]).toBeUndefined();
  });

  it("should throw for unknown rule filter", () => {
    expect(() => runDoctorScan(store, "nonexistent")).toThrow("Unknown rule");
  });
});

describe("runDoctorFix", () => {
  let store: DocumentStore;
  let tmpDir: string;

  beforeEach(() => {
    ({ store, tmpDir } = setupStore());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should fix issues and report them", () => {
    store.create("action", {
      title: "A1",
      tags: ["stream:backend"],
    } as any);

    const report = runDoctorFix(store);
    expect(report.summary.fixedIssues).toBe(1);

    // Verify the fix persisted
    const doc = store.get("A-001")!;
    expect(doc.frontmatter.tags).toContain("focus:backend");
    expect(doc.frontmatter.tags).not.toContain("stream:backend");
  });

  it("should support rule filtering in fix mode", () => {
    store.create("action", {
      title: "A1",
      tags: ["stream:backend"],
      status: "done",
      progress: 50,
    } as any);

    runDoctorFix(store, "tag-migration");
    // Only tag-migration fixes should be applied
    const doc = store.get("A-001")!;
    expect(doc.frontmatter.tags).toContain("focus:backend");
    // progress should NOT have been fixed
    expect((doc.frontmatter as any).progress).toBe(50);
  });
});
