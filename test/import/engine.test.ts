import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import matter from "gray-matter";
import { DocumentStore } from "../../src/storage/store.js";
import {
  buildImportPlan,
  executeImportPlan,
  formatPlanSummary,
} from "../../src/import/engine.js";
import type { ImportOptions } from "../../src/import/types.js";

function defaultOptions(overrides?: Partial<ImportOptions>): ImportOptions {
  return {
    dryRun: false,
    conflict: "renumber",
    ingest: false,
    as: "product-owner",
    draft: true,
    ...overrides,
  };
}

function writeMarvinDoc(
  dir: string,
  fileName: string,
  frontmatter: Record<string, unknown>,
  content: string,
): void {
  const raw = matter.stringify(`\n${content}\n`, frontmatter);
  fs.writeFileSync(path.join(dir, fileName), raw);
}

describe("buildImportPlan", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-engine-"));
    marvinDir = path.join(tmpDir, "target", ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs", "decisions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "actions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "questions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "sources"), { recursive: true });
    store = new DocumentStore(marvinDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should plan import of a single Marvin document", () => {
    const sourceDir = path.join(tmpDir, "source");
    fs.mkdirSync(sourceDir);
    writeMarvinDoc(sourceDir, "D-001.md", {
      id: "D-001",
      title: "Use REST",
      type: "decision",
      status: "decided",
      created: "2026-01-01",
      updated: "2026-01-01",
    }, "We chose REST.");

    const plan = buildImportPlan(
      path.join(sourceDir, "D-001.md"),
      store,
      marvinDir,
      defaultOptions(),
    );

    expect(plan.classification.type).toBe("marvin-document");
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].action).toBe("import");
    expect(plan.items[0].originalId).toBe("D-001");
    expect(plan.items[0].newId).toBe("D-001");
  });

  it("should plan import from a docs directory", () => {
    const sourceDir = path.join(tmpDir, "docs");
    fs.mkdirSync(path.join(sourceDir, "decisions"), { recursive: true });
    writeMarvinDoc(path.join(sourceDir, "decisions"), "D-001.md", {
      id: "D-001",
      title: "Decision 1",
      type: "decision",
      status: "open",
      created: "2026-01-01",
      updated: "2026-01-01",
    }, "Content 1");
    writeMarvinDoc(path.join(sourceDir, "decisions"), "D-002.md", {
      id: "D-002",
      title: "Decision 2",
      type: "decision",
      status: "open",
      created: "2026-01-01",
      updated: "2026-01-01",
    }, "Content 2");

    const plan = buildImportPlan(sourceDir, store, marvinDir, defaultOptions());

    expect(plan.classification.type).toBe("docs-directory");
    expect(plan.items.filter((i) => i.action === "import")).toHaveLength(2);
  });

  it("should plan import from a Marvin project directory", () => {
    const sourceProject = path.join(tmpDir, "source-project");
    const sourceMarvin = path.join(sourceProject, ".marvin");
    fs.mkdirSync(path.join(sourceMarvin, "docs", "decisions"), { recursive: true });
    fs.writeFileSync(path.join(sourceMarvin, "config.yaml"), "name: source\n");
    writeMarvinDoc(path.join(sourceMarvin, "docs", "decisions"), "D-001.md", {
      id: "D-001",
      title: "Source Decision",
      type: "decision",
      status: "decided",
      created: "2026-01-01",
      updated: "2026-01-01",
    }, "From source project");

    const plan = buildImportPlan(
      sourceMarvin,
      store,
      marvinDir,
      defaultOptions(),
    );

    expect(plan.classification.type).toBe("marvin-project");
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].action).toBe("import");
  });

  it("should plan raw source file copy", () => {
    const file = path.join(tmpDir, "report.pdf");
    fs.writeFileSync(file, "fake pdf");

    const plan = buildImportPlan(file, store, marvinDir, defaultOptions());

    expect(plan.classification.type).toBe("raw-source-file");
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].action).toBe("copy");
    expect(plan.items[0].targetPath).toContain("sources");
  });

  it("should plan raw source directory copy", () => {
    const rawDir = path.join(tmpDir, "raw");
    fs.mkdirSync(rawDir);
    fs.writeFileSync(path.join(rawDir, "a.pdf"), "pdf content");
    fs.writeFileSync(path.join(rawDir, "b.txt"), "text content");

    const plan = buildImportPlan(rawDir, store, marvinDir, defaultOptions());

    expect(plan.classification.type).toBe("raw-source-dir");
    expect(plan.items).toHaveLength(2);
    expect(plan.items.every((i) => i.action === "copy")).toBe(true);
  });

  it("should apply skip conflict strategy", () => {
    store.create("decision", { title: "Existing" });

    const sourceDir = path.join(tmpDir, "source");
    fs.mkdirSync(sourceDir);
    writeMarvinDoc(sourceDir, "D-001.md", {
      id: "D-001",
      title: "Conflict",
      type: "decision",
      status: "open",
      created: "2026-01-01",
      updated: "2026-01-01",
    }, "This conflicts");

    const plan = buildImportPlan(
      path.join(sourceDir, "D-001.md"),
      store,
      marvinDir,
      defaultOptions({ conflict: "skip" }),
    );

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].action).toBe("skip");
    expect(plan.items[0].originalId).toBe("D-001");
  });

  it("should apply renumber conflict strategy", () => {
    store.create("decision", { title: "Existing" });

    const sourceDir = path.join(tmpDir, "source");
    fs.mkdirSync(sourceDir);
    writeMarvinDoc(sourceDir, "D-001.md", {
      id: "D-001",
      title: "Conflict",
      type: "decision",
      status: "open",
      created: "2026-01-01",
      updated: "2026-01-01",
    }, "This gets renumbered");

    const plan = buildImportPlan(
      path.join(sourceDir, "D-001.md"),
      store,
      marvinDir,
      defaultOptions({ conflict: "renumber" }),
    );

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].action).toBe("import");
    expect(plan.items[0].originalId).toBe("D-001");
    expect(plan.items[0].newId).toBe("D-002");
  });
});

describe("executeImportPlan", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-engine-"));
    marvinDir = path.join(tmpDir, "target", ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs", "decisions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "actions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "questions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "sources"), { recursive: true });
    store = new DocumentStore(marvinDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should execute document import plan", () => {
    const sourceDir = path.join(tmpDir, "source");
    fs.mkdirSync(sourceDir);
    writeMarvinDoc(sourceDir, "D-001.md", {
      id: "D-001",
      title: "Imported Decision",
      type: "decision",
      status: "decided",
      created: "2026-01-01",
      updated: "2026-01-01",
    }, "Imported content");

    const plan = buildImportPlan(
      path.join(sourceDir, "D-001.md"),
      store,
      marvinDir,
      defaultOptions(),
    );
    const result = executeImportPlan(plan, store, marvinDir, defaultOptions());

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.copied).toBe(0);

    const doc = store.get("D-001");
    expect(doc).toBeDefined();
    expect(doc!.frontmatter.title).toBe("Imported Decision");
    expect(doc!.content).toContain("Imported content");
  });

  it("should copy raw source files", () => {
    const file = path.join(tmpDir, "report.pdf");
    fs.writeFileSync(file, "fake pdf content");

    const plan = buildImportPlan(file, store, marvinDir, defaultOptions());
    const result = executeImportPlan(plan, store, marvinDir, defaultOptions());

    expect(result.copied).toBe(1);
    expect(
      fs.existsSync(path.join(marvinDir, "sources", "report.pdf")),
    ).toBe(true);
  });

  it("should tag imported documents when --tag is set", () => {
    const sourceDir = path.join(tmpDir, "source");
    fs.mkdirSync(sourceDir);
    writeMarvinDoc(sourceDir, "A-001.md", {
      id: "A-001",
      title: "Tagged Action",
      type: "action",
      status: "open",
      created: "2026-01-01",
      updated: "2026-01-01",
    }, "Content");

    const opts = defaultOptions({ tag: "imported:proto" });
    const plan = buildImportPlan(
      path.join(sourceDir, "A-001.md"),
      store,
      marvinDir,
      opts,
    );
    const result = executeImportPlan(plan, store, marvinDir, opts);

    expect(result.imported).toBe(1);
    const doc = store.get("A-001");
    expect(doc!.frontmatter.tags).toContain("imported:proto");
  });

  it("should overwrite existing documents with overwrite strategy", () => {
    store.create("decision", { title: "Original" }, "Original content");

    const sourceDir = path.join(tmpDir, "source");
    fs.mkdirSync(sourceDir);
    writeMarvinDoc(sourceDir, "D-001.md", {
      id: "D-001",
      title: "Replacement",
      type: "decision",
      status: "decided",
      created: "2026-01-01",
      updated: "2026-01-01",
    }, "Replacement content");

    const opts = defaultOptions({ conflict: "overwrite" });
    const plan = buildImportPlan(
      path.join(sourceDir, "D-001.md"),
      store,
      marvinDir,
      opts,
    );
    const result = executeImportPlan(plan, store, marvinDir, opts);

    expect(result.imported).toBe(1);
    const doc = store.get("D-001");
    expect(doc!.frontmatter.title).toBe("Replacement");
  });
});

describe("formatPlanSummary", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-engine-"));
    marvinDir = path.join(tmpDir, "target", ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs", "decisions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "actions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "questions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "sources"), { recursive: true });
    store = new DocumentStore(marvinDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should format a plan with imports", () => {
    const sourceDir = path.join(tmpDir, "source");
    fs.mkdirSync(sourceDir);
    writeMarvinDoc(sourceDir, "D-001.md", {
      id: "D-001",
      title: "Test",
      type: "decision",
      status: "open",
      created: "2026-01-01",
      updated: "2026-01-01",
    }, "Content");

    const plan = buildImportPlan(
      path.join(sourceDir, "D-001.md"),
      store,
      marvinDir,
      defaultOptions(),
    );
    const summary = formatPlanSummary(plan);

    expect(summary).toContain("Detected: Marvin document");
    expect(summary).toContain("Documents to import: 1");
    expect(summary).toContain("D-001");
  });

  it("should format a plan with raw copies", () => {
    const file = path.join(tmpDir, "report.pdf");
    fs.writeFileSync(file, "fake");

    const plan = buildImportPlan(file, store, marvinDir, defaultOptions());
    const summary = formatPlanSummary(plan);

    expect(summary).toContain("Detected: Raw source file");
    expect(summary).toContain("Files to copy to sources/: 1");
    expect(summary).toContain("report.pdf");
  });

  it("should show empty message for empty plans", () => {
    const emptyDir = path.join(tmpDir, "empty");
    fs.mkdirSync(emptyDir);

    const plan = buildImportPlan(emptyDir, store, marvinDir, defaultOptions());
    const summary = formatPlanSummary(plan);

    expect(summary).toContain("Nothing to import.");
  });
});
