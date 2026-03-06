import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import type { DocumentTypeRegistration } from "../../../src/storage/types.js";
import { buildDoctorContext } from "../../../src/doctor/engine.js";
import { arrayNormalizationRule } from "../../../src/doctor/rules/array-normalization.js";

const REGISTRATIONS: DocumentTypeRegistration[] = [
  { type: "epic", dirName: "epics", idPrefix: "E" },
  { type: "task", dirName: "tasks", idPrefix: "T" },
];

function setupStore(): { store: DocumentStore; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-doctor-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  for (const dir of ["decisions", "actions", "questions", "epics", "tasks"]) {
    fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
  }
  return { store: new DocumentStore(marvinDir, REGISTRATIONS), tmpDir };
}

describe("array-normalization rule", () => {
  let store: DocumentStore;
  let tmpDir: string;

  beforeEach(() => {
    ({ store, tmpDir } = setupStore());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should detect string-valued linkedEpic", () => {
    store.create("task", { title: "T1", linkedEpic: "E-001" } as any);
    const ctx = buildDoctorContext(store);
    const issues = arrayNormalizationRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("linkedEpic");
    expect(issues[0].message).toContain("string");
  });

  it("should detect linkedEpics alias", () => {
    store.create("task", { title: "T1", linkedEpics: ["E-001"] } as any);
    const ctx = buildDoctorContext(store);
    const issues = arrayNormalizationRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("linkedEpics");
    expect(issues[0].message).toContain("linkedEpic");
  });

  it("should detect string-valued linkedFeature", () => {
    store.create("epic", { title: "E1", linkedFeature: "F-001" } as any);
    const ctx = buildDoctorContext(store);
    const issues = arrayNormalizationRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("linkedFeature");
  });

  it("should not flag array-valued fields", () => {
    store.create("task", { title: "T1", linkedEpic: ["E-001"] } as any);
    const ctx = buildDoctorContext(store);
    const issues = arrayNormalizationRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should fix string → array for linkedEpic", () => {
    store.create("task", { title: "T1", linkedEpic: "E-001" } as any);
    const ctx = buildDoctorContext(store);
    const fixes = arrayNormalizationRule.fix(ctx);
    expect(fixes).toHaveLength(1);

    const doc = store.get("T-001")!;
    expect((doc.frontmatter as any).linkedEpic).toEqual(["E-001"]);
  });

  it("should merge linkedEpics alias into linkedEpic", () => {
    store.create("task", {
      title: "T1",
      linkedEpic: ["E-001"],
      linkedEpics: ["E-002"],
    } as any);
    const ctx = buildDoctorContext(store);
    const fixes = arrayNormalizationRule.fix(ctx);
    expect(fixes.length).toBeGreaterThanOrEqual(1);

    const doc = store.get("T-001")!;
    const le = (doc.frontmatter as any).linkedEpic;
    expect(le).toContain("E-001");
    expect(le).toContain("E-002");
  });
});
