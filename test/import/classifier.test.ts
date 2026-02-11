import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import matter from "gray-matter";
import { classifyPath, classifyFile, isValidMarvinDocument } from "../../src/import/classifier.js";

const KNOWN_TYPES = ["decision", "action", "question"];
const KNOWN_DIR_NAMES = ["decisions", "actions", "questions"];

describe("isValidMarvinDocument", () => {
  it("should accept valid frontmatter with matching type and ID pattern", () => {
    expect(
      isValidMarvinDocument({ id: "D-001", type: "decision" }, KNOWN_TYPES),
    ).toBe(true);
  });

  it("should accept multi-digit IDs", () => {
    expect(
      isValidMarvinDocument({ id: "A-1234", type: "action" }, KNOWN_TYPES),
    ).toBe(true);
  });

  it("should reject missing id", () => {
    expect(
      isValidMarvinDocument({ type: "decision" }, KNOWN_TYPES),
    ).toBe(false);
  });

  it("should reject missing type", () => {
    expect(
      isValidMarvinDocument({ id: "D-001" }, KNOWN_TYPES),
    ).toBe(false);
  });

  it("should reject unknown type", () => {
    expect(
      isValidMarvinDocument({ id: "X-001", type: "unknown" }, KNOWN_TYPES),
    ).toBe(false);
  });

  it("should reject malformed ID patterns", () => {
    expect(
      isValidMarvinDocument({ id: "D001", type: "decision" }, KNOWN_TYPES),
    ).toBe(false);
    expect(
      isValidMarvinDocument({ id: "d-001", type: "decision" }, KNOWN_TYPES),
    ).toBe(false);
    expect(
      isValidMarvinDocument({ id: "D-01", type: "decision" }, KNOWN_TYPES),
    ).toBe(false);
  });
});

describe("classifyFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-classify-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should classify a PDF as raw-source-file", () => {
    const file = path.join(tmpDir, "doc.pdf");
    fs.writeFileSync(file, "fake pdf content");
    const result = classifyFile(file, KNOWN_TYPES);
    expect(result.type).toBe("raw-source-file");
  });

  it("should classify a .txt file as raw-source-file", () => {
    const file = path.join(tmpDir, "notes.txt");
    fs.writeFileSync(file, "plain text");
    const result = classifyFile(file, KNOWN_TYPES);
    expect(result.type).toBe("raw-source-file");
  });

  it("should classify a valid Marvin markdown as marvin-document", () => {
    const file = path.join(tmpDir, "D-001.md");
    const content = matter.stringify("Decision content", {
      id: "D-001",
      title: "Test Decision",
      type: "decision",
      status: "open",
      created: "2026-02-08T10:00:00.000Z",
      updated: "2026-02-08T10:00:00.000Z",
    });
    fs.writeFileSync(file, content);
    const result = classifyFile(file, KNOWN_TYPES);
    expect(result.type).toBe("marvin-document");
  });

  it("should classify markdown without valid frontmatter as raw-source-file", () => {
    const file = path.join(tmpDir, "readme.md");
    fs.writeFileSync(file, "# Just a readme\n\nNo frontmatter.");
    const result = classifyFile(file, KNOWN_TYPES);
    expect(result.type).toBe("raw-source-file");
  });
});

describe("classifyPath", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-classify-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should detect a Marvin project directory (with config.yaml)", () => {
    const projectDir = path.join(tmpDir, "myproject");
    fs.mkdirSync(projectDir);
    fs.writeFileSync(
      path.join(projectDir, "config.yaml"),
      "name: test-project\n",
    );
    const result = classifyPath(projectDir, KNOWN_TYPES, KNOWN_DIR_NAMES);
    expect(result.type).toBe("marvin-project");
  });

  it("should detect a .marvin/ directory", () => {
    const marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(marvinDir);
    fs.writeFileSync(
      path.join(marvinDir, "config.yaml"),
      "name: test-project\n",
    );
    const result = classifyPath(marvinDir, KNOWN_TYPES, KNOWN_DIR_NAMES);
    expect(result.type).toBe("marvin-project");
  });

  it("should detect a docs directory with known subdirs", () => {
    const docsDir = path.join(tmpDir, "governance");
    fs.mkdirSync(path.join(docsDir, "decisions"), { recursive: true });
    fs.mkdirSync(path.join(docsDir, "actions"), { recursive: true });
    const result = classifyPath(docsDir, KNOWN_TYPES, KNOWN_DIR_NAMES);
    expect(result.type).toBe("docs-directory");
  });

  it("should detect a directory with Marvin markdown files as docs-directory", () => {
    const docsDir = path.join(tmpDir, "docs");
    fs.mkdirSync(docsDir);
    const content = matter.stringify("Content", {
      id: "D-001",
      title: "Test",
      type: "decision",
      status: "open",
      created: "2026-01-01",
      updated: "2026-01-01",
    });
    fs.writeFileSync(path.join(docsDir, "D-001.md"), content);
    const result = classifyPath(docsDir, KNOWN_TYPES, KNOWN_DIR_NAMES);
    expect(result.type).toBe("docs-directory");
  });

  it("should classify a directory with only non-marvin files as raw-source-dir", () => {
    const rawDir = path.join(tmpDir, "rawstuff");
    fs.mkdirSync(rawDir);
    fs.writeFileSync(path.join(rawDir, "report.pdf"), "fake pdf");
    fs.writeFileSync(path.join(rawDir, "notes.txt"), "text notes");
    const result = classifyPath(rawDir, KNOWN_TYPES, KNOWN_DIR_NAMES);
    expect(result.type).toBe("raw-source-dir");
  });

  it("should classify a single file path", () => {
    const file = path.join(tmpDir, "report.pdf");
    fs.writeFileSync(file, "fake pdf");
    const result = classifyPath(file, KNOWN_TYPES, KNOWN_DIR_NAMES);
    expect(result.type).toBe("raw-source-file");
  });
});
