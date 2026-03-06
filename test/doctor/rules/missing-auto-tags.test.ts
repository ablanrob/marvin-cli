import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import type { DocumentTypeRegistration } from "../../../src/storage/types.js";
import { buildDoctorContext } from "../../../src/doctor/engine.js";
import { missingAutoTagsRule } from "../../../src/doctor/rules/missing-auto-tags.js";

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

describe("missing-auto-tags rule", () => {
  let store: DocumentStore;
  let tmpDir: string;

  beforeEach(() => {
    ({ store, tmpDir } = setupStore());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should detect missing epic: tag for linkedEpic", () => {
    store.create("task", {
      title: "T1",
      linkedEpic: ["E-001"],
      tags: [],
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = missingAutoTagsRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("epic:E-001");
  });

  it("should detect missing feature: tag for linkedFeature", () => {
    store.create("epic", {
      title: "E1",
      linkedFeature: ["F-001"],
      tags: [],
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = missingAutoTagsRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("feature:F-001");
  });

  it("should not flag when tags already present", () => {
    store.create("task", {
      title: "T1",
      linkedEpic: ["E-001"],
      tags: ["epic:E-001"],
    } as any);
    const ctx = buildDoctorContext(store);
    const issues = missingAutoTagsRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should not flag documents without linked fields", () => {
    store.create("action", { title: "A1", tags: ["priority:high"] });
    const ctx = buildDoctorContext(store);
    const issues = missingAutoTagsRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should fix by adding missing tags", () => {
    store.create("task", {
      title: "T1",
      linkedEpic: ["E-001", "E-002"],
      tags: ["epic:E-001"],
    } as any);
    const ctx = buildDoctorContext(store);
    const fixes = missingAutoTagsRule.fix(ctx);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].fixDescription).toContain("epic:E-002");

    const doc = store.get("T-001")!;
    expect(doc.frontmatter.tags).toContain("epic:E-001");
    expect(doc.frontmatter.tags).toContain("epic:E-002");
  });

  it("should fix feature tags on epics", () => {
    store.create("epic", {
      title: "E1",
      linkedFeature: ["F-001"],
      tags: [],
    } as any);
    const ctx = buildDoctorContext(store);
    const fixes = missingAutoTagsRule.fix(ctx);
    expect(fixes).toHaveLength(1);

    const doc = store.get("E-001")!;
    expect(doc.frontmatter.tags).toContain("feature:F-001");
  });
});
