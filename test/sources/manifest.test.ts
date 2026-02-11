import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import { SourceManifestManager } from "../../src/sources/manifest.js";
import type { SourceManifest } from "../../src/sources/types.js";

describe("SourceManifestManager", () => {
  let tmpDir: string;
  let marvinDir: string;
  let sourcesDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-sources-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    sourcesDir = path.join(marvinDir, "sources");
    fs.mkdirSync(sourcesDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should initialize with empty manifest when none exists", () => {
    const manager = new SourceManifestManager(marvinDir);
    expect(manager.list()).toEqual([]);
  });

  it("should scan and detect new files", () => {
    fs.writeFileSync(path.join(sourcesDir, "requirements.md"), "# Requirements\n\nSome content");
    fs.writeFileSync(path.join(sourcesDir, "notes.txt"), "Some notes");

    const manager = new SourceManifestManager(marvinDir);
    const result = manager.scan();

    expect(result.added).toHaveLength(2);
    expect(result.added).toContain("requirements.md");
    expect(result.added).toContain("notes.txt");
    expect(result.changed).toHaveLength(0);
    expect(result.removed).toHaveLength(0);

    const all = manager.list();
    expect(all).toHaveLength(2);
    expect(all[0].entry.status).toBe("pending");
  });

  it("should ignore non-source files", () => {
    fs.writeFileSync(path.join(sourcesDir, "image.png"), "not a real png");
    fs.writeFileSync(path.join(sourcesDir, "data.json"), "{}");
    fs.writeFileSync(path.join(sourcesDir, "doc.md"), "# Doc");

    const manager = new SourceManifestManager(marvinDir);
    const result = manager.scan();

    expect(result.added).toEqual(["doc.md"]);
  });

  it("should detect changed files by hash", () => {
    fs.writeFileSync(path.join(sourcesDir, "spec.md"), "Version 1");

    const manager = new SourceManifestManager(marvinDir);
    manager.scan();
    manager.markCompleted("spec.md", ["D-001"]);

    // Modify the file
    fs.writeFileSync(path.join(sourcesDir, "spec.md"), "Version 2");

    const result = manager.scan();
    expect(result.changed).toEqual(["spec.md"]);
    expect(manager.get("spec.md")!.status).toBe("pending");
    expect(manager.get("spec.md")!.artifacts).toEqual([]);
  });

  it("should detect removed files", () => {
    fs.writeFileSync(path.join(sourcesDir, "temp.md"), "Temporary");

    const manager = new SourceManifestManager(marvinDir);
    manager.scan();

    fs.unlinkSync(path.join(sourcesDir, "temp.md"));

    const result = manager.scan();
    expect(result.removed).toEqual(["temp.md"]);
    expect(manager.get("temp.md")).toBeUndefined();
  });

  it("should persist manifest across instances", () => {
    fs.writeFileSync(path.join(sourcesDir, "doc.md"), "Content");

    const manager1 = new SourceManifestManager(marvinDir);
    manager1.scan();
    manager1.markCompleted("doc.md", ["D-001", "A-001"]);

    const manager2 = new SourceManifestManager(marvinDir);
    const entry = manager2.get("doc.md");
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("completed");
    expect(entry!.artifacts).toEqual(["D-001", "A-001"]);
  });

  it("should mark processing status", () => {
    fs.writeFileSync(path.join(sourcesDir, "doc.md"), "Content");

    const manager = new SourceManifestManager(marvinDir);
    manager.scan();
    manager.markProcessing("doc.md");

    expect(manager.get("doc.md")!.status).toBe("processing");
  });

  it("should mark error status", () => {
    fs.writeFileSync(path.join(sourcesDir, "doc.md"), "Content");

    const manager = new SourceManifestManager(marvinDir);
    manager.scan();
    manager.markError("doc.md", "Failed to process");

    const entry = manager.get("doc.md")!;
    expect(entry.status).toBe("error");
    expect(entry.error).toBe("Failed to process");
  });

  it("should list unprocessed files", () => {
    fs.writeFileSync(path.join(sourcesDir, "a.md"), "A");
    fs.writeFileSync(path.join(sourcesDir, "b.md"), "B");
    fs.writeFileSync(path.join(sourcesDir, "c.md"), "C");

    const manager = new SourceManifestManager(marvinDir);
    manager.scan();
    manager.markCompleted("b.md", ["D-001"]);

    const unprocessed = manager.unprocessed();
    expect(unprocessed).toHaveLength(2);
    expect(unprocessed).toContain("a.md");
    expect(unprocessed).toContain("c.md");
  });

  it("should filter list by status", () => {
    fs.writeFileSync(path.join(sourcesDir, "a.md"), "A");
    fs.writeFileSync(path.join(sourcesDir, "b.md"), "B");

    const manager = new SourceManifestManager(marvinDir);
    manager.scan();
    manager.markCompleted("a.md", ["D-001"]);

    const completed = manager.list("completed");
    expect(completed).toHaveLength(1);
    expect(completed[0].name).toBe("a.md");

    const pending = manager.list("pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].name).toBe("b.md");
  });

  it("should throw when marking unknown file", () => {
    const manager = new SourceManifestManager(marvinDir);
    expect(() => manager.markProcessing("nonexistent.md")).toThrow(
      'Source file "nonexistent.md" not in manifest',
    );
  });

  it("should include error status files in unprocessed", () => {
    fs.writeFileSync(path.join(sourcesDir, "fail.md"), "Content");

    const manager = new SourceManifestManager(marvinDir);
    manager.scan();
    manager.markError("fail.md", "Some error");

    expect(manager.unprocessed()).toContain("fail.md");
  });

  it("should handle .manifest.yaml as the manifest filename", () => {
    fs.writeFileSync(path.join(sourcesDir, "doc.md"), "Content");

    const manager = new SourceManifestManager(marvinDir);
    manager.scan();

    expect(fs.existsSync(path.join(sourcesDir, ".manifest.yaml"))).toBe(true);
    const raw = fs.readFileSync(path.join(sourcesDir, ".manifest.yaml"), "utf-8");
    const parsed = YAML.parse(raw) as SourceManifest;
    expect(parsed.version).toBe(1);
    expect(parsed.files["doc.md"]).toBeDefined();
  });
});
