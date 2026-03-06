import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { buildDoctorContext } from "../../../src/doctor/engine.js";
import { tagMigrationRule } from "../../../src/doctor/rules/tag-migration.js";

function setupStore(): { store: DocumentStore; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-doctor-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  for (const dir of ["decisions", "actions", "questions"]) {
    fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
  }
  return { store: new DocumentStore(marvinDir), tmpDir };
}

describe("tag-migration rule", () => {
  let store: DocumentStore;
  let tmpDir: string;

  beforeEach(() => {
    ({ store, tmpDir } = setupStore());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should detect stream: tags", () => {
    store.create("action", { title: "A1", tags: ["stream:backend", "stream:infra"] });
    const ctx = buildDoctorContext(store);
    const issues = tagMigrationRule.scan(ctx);
    expect(issues).toHaveLength(2);
    expect(issues[0].message).toContain("stream:backend");
    expect(issues[0].fixable).toBe(true);
    expect(issues[1].message).toContain("stream:infra");
  });

  it("should not flag focus: tags", () => {
    store.create("action", { title: "A1", tags: ["focus:backend"] });
    const ctx = buildDoctorContext(store);
    const issues = tagMigrationRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should not flag documents without tags", () => {
    store.create("action", { title: "A1" });
    const ctx = buildDoctorContext(store);
    const issues = tagMigrationRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should fix stream: → focus: tags", () => {
    store.create("action", { title: "A1", tags: ["stream:backend", "priority:high"] });
    const ctx = buildDoctorContext(store);
    const fixes = tagMigrationRule.fix(ctx);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].fixDescription).toContain("focus:backend");

    const doc = store.get("A-001")!;
    expect(doc.frontmatter.tags).toContain("focus:backend");
    expect(doc.frontmatter.tags).toContain("priority:high");
    expect(doc.frontmatter.tags).not.toContain("stream:backend");
  });

  it("should fix multiple stream: tags in one document", () => {
    store.create("action", { title: "A1", tags: ["stream:backend", "stream:infra"] });
    const ctx = buildDoctorContext(store);
    const fixes = tagMigrationRule.fix(ctx);
    expect(fixes).toHaveLength(2);

    const doc = store.get("A-001")!;
    expect(doc.frontmatter.tags).toContain("focus:backend");
    expect(doc.frontmatter.tags).toContain("focus:infra");
  });
});
