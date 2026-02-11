import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parseDocument, serializeDocument } from "../../src/storage/document.js";
import { DocumentStore } from "../../src/storage/store.js";
import type { Document } from "../../src/storage/types.js";
import type { DocumentTypeRegistration } from "../../src/storage/types.js";

describe("parseDocument", () => {
  it("should parse markdown with YAML frontmatter", () => {
    const raw = `---
id: D-001
title: Use TypeScript
type: decision
status: decided
created: "2026-02-08T10:00:00.000Z"
updated: "2026-02-08T10:00:00.000Z"
---

We decided to use TypeScript for the project.

## Rationale

Strong typing improves maintainability.
`;

    const doc = parseDocument(raw, "/test/D-001.md");

    expect(doc.frontmatter.id).toBe("D-001");
    expect(doc.frontmatter.title).toBe("Use TypeScript");
    expect(doc.frontmatter.type).toBe("decision");
    expect(doc.frontmatter.status).toBe("decided");
    expect(doc.content).toContain("We decided to use TypeScript");
    expect(doc.content).toContain("## Rationale");
    expect(doc.filePath).toBe("/test/D-001.md");
  });

  it("should handle documents with no content", () => {
    const raw = `---
id: A-001
title: Set up CI
type: action
status: open
created: "2026-02-08T10:00:00.000Z"
updated: "2026-02-08T10:00:00.000Z"
---
`;

    const doc = parseDocument(raw, "/test/A-001.md");
    expect(doc.frontmatter.id).toBe("A-001");
    expect(doc.content).toBe("");
  });

  it("should preserve custom frontmatter fields", () => {
    const raw = `---
id: Q-001
title: Which database?
type: question
status: open
created: "2026-02-08T10:00:00.000Z"
updated: "2026-02-08T10:00:00.000Z"
owner: alice
priority: high
tags:
  - architecture
  - database
---

Should we use PostgreSQL or SQLite?
`;

    const doc = parseDocument(raw, "/test/Q-001.md");
    expect(doc.frontmatter.owner).toBe("alice");
    expect(doc.frontmatter.priority).toBe("high");
    expect(doc.frontmatter.tags).toEqual(["architecture", "database"]);
  });
});

describe("serializeDocument", () => {
  it("should serialize a document back to markdown with frontmatter", () => {
    const doc: Document = {
      frontmatter: {
        id: "D-001",
        title: "Use TypeScript",
        type: "decision",
        status: "decided",
        created: "2026-02-08T10:00:00.000Z",
        updated: "2026-02-08T10:00:00.000Z",
      },
      content: "We chose TypeScript.",
      filePath: "/test/D-001.md",
    };

    const result = serializeDocument(doc);

    expect(result).toContain("id: D-001");
    expect(result).toContain("title: Use TypeScript");
    expect(result).toContain("We chose TypeScript.");
    expect(result).toContain("---");
  });

  it("should roundtrip parse -> serialize -> parse", () => {
    const raw = `---
id: A-002
title: Review PR
type: action
status: open
created: "2026-02-08T10:00:00.000Z"
updated: "2026-02-08T10:00:00.000Z"
owner: bob
tags:
  - review
---

Please review the pull request for the auth module.
`;

    const doc1 = parseDocument(raw, "/test/A-002.md");
    const serialized = serializeDocument(doc1);
    const doc2 = parseDocument(serialized, "/test/A-002.md");

    expect(doc2.frontmatter.id).toBe(doc1.frontmatter.id);
    expect(doc2.frontmatter.title).toBe(doc1.frontmatter.title);
    expect(doc2.frontmatter.status).toBe(doc1.frontmatter.status);
    expect(doc2.frontmatter.owner).toBe(doc1.frontmatter.owner);
    expect(doc2.content).toContain("Please review the pull request");
  });
});

describe("DocumentStore", () => {
  let tmpDir: string;
  let marvinDir: string;

  const COMMON_REGISTRATIONS: DocumentTypeRegistration[] = [
    { type: "meeting", dirName: "meetings", idPrefix: "M" },
    { type: "report", dirName: "reports", idPrefix: "R" },
    { type: "feature", dirName: "features", idPrefix: "F" },
    { type: "epic", dirName: "epics", idPrefix: "E" },
  ];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs", "decisions"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(marvinDir, "docs", "actions"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(marvinDir, "docs", "questions"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(marvinDir, "docs", "meetings"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(marvinDir, "docs", "reports"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(marvinDir, "docs", "features"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(marvinDir, "docs", "epics"), {
      recursive: true,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create and retrieve a document", () => {
    const store = new DocumentStore(marvinDir);

    const doc = store.create("decision", { title: "Use REST API" }, "We chose REST.");

    expect(doc.frontmatter.id).toBe("D-001");
    expect(doc.frontmatter.title).toBe("Use REST API");
    expect(doc.frontmatter.type).toBe("decision");
    expect(doc.content).toBe("We chose REST.");

    const retrieved = store.get("D-001");
    expect(retrieved).toBeDefined();
    expect(retrieved!.frontmatter.title).toBe("Use REST API");
  });

  it("should auto-increment IDs", () => {
    const store = new DocumentStore(marvinDir);

    const d1 = store.create("decision", { title: "First" });
    const d2 = store.create("decision", { title: "Second" });

    expect(d1.frontmatter.id).toBe("D-001");
    expect(d2.frontmatter.id).toBe("D-002");
  });

  it("should list documents with filters", () => {
    const store = new DocumentStore(marvinDir);

    store.create("action", { title: "Do A", status: "open" });
    store.create("action", { title: "Do B", status: "done" });
    store.create("action", { title: "Do C", status: "open", owner: "alice" });

    const all = store.list({ type: "action" });
    expect(all).toHaveLength(3);

    const open = store.list({ type: "action", status: "open" });
    expect(open).toHaveLength(2);

    const alice = store.list({ type: "action", owner: "alice" });
    expect(alice).toHaveLength(1);
    expect(alice[0].frontmatter.title).toBe("Do C");
  });

  it("should update a document", () => {
    const store = new DocumentStore(marvinDir);

    store.create("question", { title: "Which DB?" }, "PostgreSQL or SQLite?");
    const updated = store.update("Q-001", { status: "answered" }, "We chose PostgreSQL.");

    expect(updated.frontmatter.status).toBe("answered");
    expect(updated.content).toBe("We chose PostgreSQL.");

    const retrieved = store.get("Q-001");
    expect(retrieved!.frontmatter.status).toBe("answered");
    expect(retrieved!.content).toBe("We chose PostgreSQL.");
  });

  it("should return correct counts", () => {
    const store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    store.create("decision", { title: "D1" });
    store.create("decision", { title: "D2" });
    store.create("action", { title: "A1" });
    store.create("question", { title: "Q1" });

    const counts = store.counts();
    expect(counts.decision).toBe(2);
    expect(counts.action).toBe(1);
    expect(counts.question).toBe(1);
    expect(counts.meeting).toBe(0);
    expect(counts.report).toBe(0);
  });

  it("should create and retrieve a report document", () => {
    const store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    const doc = store.create(
      "report",
      { title: "Weekly Status", status: "final", tags: ["report-type:status"] },
      "# Status Report\n\nAll systems go.",
    );

    expect(doc.frontmatter.id).toBe("R-001");
    expect(doc.frontmatter.type).toBe("report");
    expect(doc.frontmatter.status).toBe("final");

    const retrieved = store.get("R-001");
    expect(retrieved).toBeDefined();
    expect(retrieved!.frontmatter.title).toBe("Weekly Status");
    expect(retrieved!.content).toContain("All systems go");

    const counts = store.counts();
    expect(counts.report).toBe(1);
  });

  it("should throw when updating non-existent document", () => {
    const store = new DocumentStore(marvinDir);
    expect(() => store.update("D-999", { status: "done" })).toThrow(
      "Document D-999 not found",
    );
  });

  it("should generate next ID correctly with existing documents", () => {
    const store = new DocumentStore(marvinDir);

    expect(store.nextId("decision")).toBe("D-001");
    store.create("decision", { title: "First" });
    expect(store.nextId("decision")).toBe("D-002");
  });

  it("should create and retrieve a feature document", () => {
    const store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    const doc = store.create("feature", { title: "User Auth", status: "draft" }, "OAuth2 login.");
    expect(doc.frontmatter.id).toBe("F-001");
    expect(doc.frontmatter.type).toBe("feature");

    const retrieved = store.get("F-001");
    expect(retrieved).toBeDefined();
    expect(retrieved!.frontmatter.title).toBe("User Auth");
  });

  it("should create and retrieve an epic document", () => {
    const store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    const doc = store.create("epic", { title: "Auth Epic", status: "planned" }, "Implement auth.");
    expect(doc.frontmatter.id).toBe("E-001");
    expect(doc.frontmatter.type).toBe("epic");

    const retrieved = store.get("E-001");
    expect(retrieved).toBeDefined();
    expect(retrieved!.frontmatter.title).toBe("Auth Epic");
  });

  it("should include feature and epic in counts", () => {
    const store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    store.create("feature", { title: "F1" });
    store.create("epic", { title: "E1" });

    const counts = store.counts();
    expect(counts.feature).toBe(1);
    expect(counts.epic).toBe(1);
  });

  it("should support plugin-registered document types", () => {
    const customRegistrations: DocumentTypeRegistration[] = [
      ...COMMON_REGISTRATIONS,
      { type: "use-case", dirName: "use-cases", idPrefix: "UC" },
    ];
    const store = new DocumentStore(marvinDir, customRegistrations);

    expect(store.registeredTypes).toContain("use-case");

    const doc = store.create("use-case", { title: "Test UC", status: "draft" }, "Use case content.");
    expect(doc.frontmatter.id).toBe("UC-001");
    expect(doc.frontmatter.type).toBe("use-case");

    const retrieved = store.get("UC-001");
    expect(retrieved).toBeDefined();
    expect(retrieved!.frontmatter.title).toBe("Test UC");

    const counts = store.counts();
    expect(counts["use-case"]).toBe(1);
  });

  it("should throw for unknown document types", () => {
    const store = new DocumentStore(marvinDir);
    expect(() => store.create("unknown-type", { title: "Test" })).toThrow("Unknown document type");
    expect(() => store.nextId("unknown-type")).toThrow("Unknown document type");
  });
});
