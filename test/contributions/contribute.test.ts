import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../src/storage/store.js";
import { COMMON_REGISTRATIONS } from "../../src/plugins/common.js";
import { buildContributeSystemPrompt, buildContributeUserPrompt } from "../../src/contributions/prompts.js";
import { getPersona } from "../../src/personas/registry.js";

describe("Contribution Prompts", () => {
  const persona = getPersona("tech-lead")!;
  const projectConfig = { name: "Test Project", methodology: "generic-agile" } as any;

  it("should build draft system prompt with contribution type instructions", () => {
    const prompt = buildContributeSystemPrompt(persona, "action-result", projectConfig, true);

    expect(prompt).toContain("Technical Lead");
    expect(prompt).toContain("Test Project");
    expect(prompt).toContain("action-result");
    expect(prompt).toContain("Draft Proposal");
    expect(prompt).toContain("Do NOT create or update any artifacts");
    expect(prompt).toContain("Action Result");
    expect(prompt).not.toContain("Direct Execution");
  });

  it("should build direct system prompt with create and update tool instructions", () => {
    const prompt = buildContributeSystemPrompt(persona, "spike-findings", projectConfig, false);

    expect(prompt).toContain("Direct Execution");
    expect(prompt).toContain("create_decision");
    expect(prompt).toContain("update_decision");
    expect(prompt).toContain("Spike Findings");
    expect(prompt).not.toContain("Draft Proposal");
  });

  it("should build user prompt with contribution details", () => {
    const prompt = buildContributeUserPrompt("C-001", "action-result", "A-001 is complete.", "A-001", false);

    expect(prompt).toContain("C-001");
    expect(prompt).toContain("action-result");
    expect(prompt).toContain("A-001 is complete.");
    expect(prompt).toContain("Related Artifact:** A-001");
    expect(prompt).toContain("source:C-001");
  });

  it("should build user prompt without aboutArtifact", () => {
    const prompt = buildContributeUserPrompt("C-002", "risk-finding", "Found a risk.", undefined, true);

    expect(prompt).toContain("C-002");
    expect(prompt).not.toContain("Related Artifact");
    expect(prompt).toContain("propose");
  });

  it("should include fallback instructions for unknown contribution type", () => {
    const prompt = buildContributeSystemPrompt(persona, "custom-type", projectConfig, false);

    expect(prompt).toContain("Analyze the contribution and determine appropriate governance effects");
  });
});

describe("Contribution Type Validation", () => {
  it("should have contributionTypes defined on tech-lead", () => {
    const persona = getPersona("tech-lead")!;
    expect(persona.contributionTypes).toBeDefined();
    expect(persona.contributionTypes).toContain("action-result");
    expect(persona.contributionTypes).toContain("spike-findings");
    expect(persona.contributionTypes).toContain("technical-assessment");
    expect(persona.contributionTypes).toContain("architecture-review");
  });

  it("should have contributionTypes defined on product-owner", () => {
    const persona = getPersona("product-owner")!;
    expect(persona.contributionTypes).toBeDefined();
    expect(persona.contributionTypes).toContain("stakeholder-feedback");
    expect(persona.contributionTypes).toContain("acceptance-result");
    expect(persona.contributionTypes).toContain("priority-change");
    expect(persona.contributionTypes).toContain("market-insight");
  });

  it("should have contributionTypes defined on delivery-manager", () => {
    const persona = getPersona("delivery-manager")!;
    expect(persona.contributionTypes).toBeDefined();
    expect(persona.contributionTypes).toContain("risk-finding");
    expect(persona.contributionTypes).toContain("blocker-report");
    expect(persona.contributionTypes).toContain("dependency-update");
    expect(persona.contributionTypes).toContain("status-assessment");
  });
});

describe("Contribution Document Storage", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "contributions"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create contribution documents with C-xxx IDs", () => {
    const doc = store.create("contribution", {
      title: "Test Contribution",
      persona: "tech-lead",
      contributionType: "action-result",
    } as any, "Some content");

    expect(doc.frontmatter.id).toBe("C-001");
    expect(doc.frontmatter.type).toBe("contribution");
    expect(doc.frontmatter.persona).toBe("tech-lead");
    expect(doc.frontmatter.contributionType).toBe("action-result");
  });

  it("should store contribution files as C-xxx.md", () => {
    store.create("contribution", {
      title: "Test",
      persona: "tech-lead",
      contributionType: "action-result",
    } as any, "Content");

    const contribDir = path.join(marvinDir, "docs", "contributions");
    const files = fs.readdirSync(contribDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe("C-001.md");
  });

  it("should append Effects section to contribution document", () => {
    const doc = store.create("contribution", {
      title: "Test",
      persona: "tech-lead",
      contributionType: "action-result",
    } as any, "Original content");

    // Create a decision to reference
    store.create("decision", { title: "New Decision" } as any, "Decision content");

    // Append effects
    const effectsSection = "\n\n## Effects\n### Created\n- D-001: New Decision";
    const updatedContent = doc.content + effectsSection;
    store.update("C-001", { status: "processed" }, updatedContent);

    const updated = store.get("C-001")!;
    expect(updated.frontmatter.status).toBe("processed");
    expect(updated.content).toContain("## Effects");
    expect(updated.content).toContain("D-001: New Decision");
  });

  it("should track source tags when wrapping store.create", () => {
    const contributionId = "C-001";
    const createdArtifacts: string[] = [];

    // Simulate the wrapping done in contributeFromPersona
    const originalCreate = store.create.bind(store);
    store.create = (type, frontmatter, content) => {
      const tags = frontmatter.tags ?? [];
      const sourceTag = `source:${contributionId}`;
      if (!tags.includes(sourceTag)) {
        tags.push(sourceTag);
      }
      const doc = originalCreate(type, { ...frontmatter, source: contributionId, tags }, content);
      createdArtifacts.push(doc.frontmatter.id);
      return doc;
    };

    store.create("decision", { title: "Tagged Decision" } as any, "Content");

    expect(createdArtifacts).toContain("D-001");
    const doc = store.get("D-001")!;
    expect(doc.frontmatter.tags).toContain("source:C-001");
    expect(doc.frontmatter.source).toBe("C-001");
  });

  it("should track source tags when wrapping store.update", () => {
    const contributionId = "C-001";
    const updatedArtifacts: string[] = [];

    // Create an action first
    store.create("action", { title: "Original Action" } as any, "Content");

    // Simulate the wrapping done in contributeFromPersona
    const originalUpdate = store.update.bind(store);
    store.update = (id, updates, content) => {
      if (id === contributionId) {
        return originalUpdate(id, updates, content);
      }
      const existing = store.get(id);
      const existingTags: string[] = existing?.frontmatter.tags ?? [];
      const sourceTag = `source:${contributionId}`;
      if (!existingTags.includes(sourceTag)) {
        existingTags.push(sourceTag);
      }
      const doc = originalUpdate(id, { ...updates, tags: existingTags }, content);
      if (!updatedArtifacts.includes(id)) {
        updatedArtifacts.push(id);
      }
      return doc;
    };

    store.update("A-001", { status: "done" });

    expect(updatedArtifacts).toContain("A-001");
    const doc = store.get("A-001")!;
    expect(doc.frontmatter.tags).toContain("source:C-001");
    expect(doc.frontmatter.status).toBe("done");
  });
});
