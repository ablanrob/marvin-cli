import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import type { DocumentTypeRegistration } from "../../../src/storage/types.js";
import { buildDoctorContext } from "../../../src/doctor/engine.js";
import { statusAlignmentRule } from "../../../src/doctor/rules/status-alignment.js";

const REGISTRATIONS: DocumentTypeRegistration[] = [
  { type: "task", dirName: "tasks", idPrefix: "T" },
  { type: "epic", dirName: "epics", idPrefix: "E" },
  { type: "feature", dirName: "features", idPrefix: "F" },
  { type: "sprint", dirName: "sprints", idPrefix: "SP" },
  { type: "meeting", dirName: "meetings", idPrefix: "M" },
];

function setupStore(): { store: DocumentStore; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-doctor-status-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  for (const dir of [
    "decisions",
    "actions",
    "questions",
    "tasks",
    "epics",
    "features",
    "sprints",
    "meetings",
  ]) {
    fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
  }
  return { store: new DocumentStore(marvinDir, REGISTRATIONS), tmpDir };
}

describe("status-alignment rule", () => {
  let store: DocumentStore;
  let tmpDir: string;

  beforeEach(() => {
    ({ store, tmpDir } = setupStore());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should report no issues for canonical statuses", () => {
    store.create("action", { title: "A1", status: "open" });
    store.create("action", { title: "A2", status: "in-progress" });
    store.create("action", { title: "A3", status: "done" });
    store.create("decision", { title: "D1", status: "decided" });
    store.create("question", { title: "Q1", status: "answered" });
    store.create("task", { title: "T1", status: "review" });
    store.create("task", { title: "T2", status: "test" });

    const ctx = buildDoctorContext(store);
    const issues = statusAlignmentRule.scan(ctx);

    expect(issues).toHaveLength(0);
  });

  it("should detect non-canonical action statuses", () => {
    store.create("action", { title: "A1", status: "blocked" });
    store.create("action", { title: "A2", status: "closed" });

    const ctx = buildDoctorContext(store);
    const issues = statusAlignmentRule.scan(ctx);

    expect(issues).toHaveLength(2);
    expect(issues[0].message).toContain('"blocked"');
    expect(issues[0].fixable).toBe(true);
    expect(issues[1].message).toContain('"closed"');
    expect(issues[1].fixable).toBe(true);
  });

  it("should detect non-canonical decision statuses", () => {
    store.create("decision", { title: "D1", status: "dismissed" });

    const ctx = buildDoctorContext(store);
    const issues = statusAlignmentRule.scan(ctx);

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('"dismissed"');
    expect(issues[0].fixable).toBe(true);
  });

  it("should mark unknown statuses as not fixable", () => {
    store.create("action", { title: "A1", status: "banana" });

    const ctx = buildDoctorContext(store);
    const issues = statusAlignmentRule.scan(ctx);

    expect(issues).toHaveLength(1);
    expect(issues[0].fixable).toBe(false);
    expect(issues[0].message).toContain('"banana"');
  });

  it("should fix actions with legacy statuses", () => {
    store.create("action", { title: "A1", status: "blocked" });
    store.create("action", { title: "A2", status: "closed" });

    const ctx = buildDoctorContext(store);
    const fixes = statusAlignmentRule.fix(ctx);

    expect(fixes).toHaveLength(2);
    expect(fixes[0].fixDescription).toContain('"blocked" → "in-progress"');
    expect(fixes[1].fixDescription).toContain('"closed" → "done"');

    expect(store.get("A-001")!.frontmatter.status).toBe("in-progress");
    expect(store.get("A-002")!.frontmatter.status).toBe("done");
  });

  it("should fix decisions with dismissed status", () => {
    store.create("decision", { title: "D1", status: "dismissed" });

    const ctx = buildDoctorContext(store);
    const fixes = statusAlignmentRule.fix(ctx);

    expect(fixes).toHaveLength(1);
    expect(store.get("D-001")!.frontmatter.status).toBe("superseded");
  });

  it("should fix questions with legacy statuses", () => {
    store.create("question", { title: "Q1", status: "closed" });

    const ctx = buildDoctorContext(store);
    const fixes = statusAlignmentRule.fix(ctx);

    expect(fixes).toHaveLength(1);
    expect(store.get("Q-001")!.frontmatter.status).toBe("answered");
  });

  it("should fix sprints with cancelled status", () => {
    store.create("sprint", {
      title: "SP1",
      status: "cancelled",
      startDate: "2026-03-01",
      endDate: "2026-03-14",
    });

    const ctx = buildDoctorContext(store);
    const fixes = statusAlignmentRule.fix(ctx);

    expect(fixes).toHaveLength(1);
    expect(store.get("SP-001")!.frontmatter.status).toBe("completed");
  });

  it("should fix tasks with legacy statuses", () => {
    store.create("task", { title: "T1", status: "open" });

    const ctx = buildDoctorContext(store);
    const fixes = statusAlignmentRule.fix(ctx);

    expect(fixes).toHaveLength(1);
    expect(store.get("T-001")!.frontmatter.status).toBe("backlog");
  });

  it("should not fix unknown statuses without mapping", () => {
    store.create("action", { title: "A1", status: "banana" });

    const ctx = buildDoctorContext(store);
    const fixes = statusAlignmentRule.fix(ctx);

    expect(fixes).toHaveLength(0);
    expect(store.get("A-001")!.frontmatter.status).toBe("banana");
  });

  it("should skip document types without defined canonical statuses", () => {
    // Core types like "report" don't have canonical statuses
    store.create("decision", { title: "D1", status: "open" });

    const ctx = buildDoctorContext(store);
    const issues = statusAlignmentRule.scan(ctx);

    // Only scans types with defined canonical statuses
    expect(issues).toHaveLength(0);
  });

  it("should list valid statuses in the issue message", () => {
    store.create("question", { title: "Q1", status: "draft" });

    const ctx = buildDoctorContext(store);
    const issues = statusAlignmentRule.scan(ctx);

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("open, answered");
  });
});
