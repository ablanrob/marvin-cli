import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { buildDoctorContext } from "../../../src/doctor/engine.js";
import { ownerRoleRule } from "../../../src/doctor/rules/owner-role.js";

function setupStore(): { store: DocumentStore; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-doctor-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  for (const dir of ["decisions", "actions", "questions"]) {
    fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
  }
  return { store: new DocumentStore(marvinDir), tmpDir };
}

describe("owner-role rule", () => {
  let store: DocumentStore;
  let tmpDir: string;

  beforeEach(() => {
    ({ store, tmpDir } = setupStore());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should flag non-persona owner values", () => {
    store.create("action", { title: "A1", owner: "alice" } as any);
    const ctx = buildDoctorContext(store);
    const issues = ownerRoleRule.scan(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('"alice"');
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].fixable).toBe(false);
  });

  it("should accept short-form persona roles", () => {
    store.create("action", { title: "A1", owner: "po" } as any);
    store.create("action", { title: "A2", owner: "dm" } as any);
    store.create("action", { title: "A3", owner: "tl" } as any);
    const ctx = buildDoctorContext(store);
    const issues = ownerRoleRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should accept long-form persona roles", () => {
    store.create("decision", { title: "D1", owner: "product-owner" } as any);
    store.create("decision", { title: "D2", owner: "delivery-manager" } as any);
    store.create("decision", { title: "D3", owner: "tech-lead" } as any);
    const ctx = buildDoctorContext(store);
    const issues = ownerRoleRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should skip documents without owner", () => {
    store.create("action", { title: "A1" });
    const ctx = buildDoctorContext(store);
    const issues = ownerRoleRule.scan(ctx);
    expect(issues).toHaveLength(0);
  });

  it("should flag multiple invalid owners", () => {
    store.create("action", { title: "A1", owner: "bob" } as any);
    store.create("question", { title: "Q1", owner: "charlie" } as any);
    const ctx = buildDoctorContext(store);
    const issues = ownerRoleRule.scan(ctx);
    expect(issues).toHaveLength(2);
  });

  it("should return no fixes (not auto-fixable)", () => {
    store.create("action", { title: "A1", owner: "alice" } as any);
    const ctx = buildDoctorContext(store);
    const fixes = ownerRoleRule.fix(ctx);
    expect(fixes).toHaveLength(0);
  });
});
