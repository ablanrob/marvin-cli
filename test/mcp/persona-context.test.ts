import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import {
  PersonaContextManager,
  buildMcpGuidance,
  buildPersonaSummaries,
} from "../../src/mcp/persona-context.js";

function createTempMarvinDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-persona-test-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  fs.mkdirSync(marvinDir, { recursive: true });
  fs.writeFileSync(path.join(marvinDir, "config.yaml"), YAML.stringify({ name: "test-project" }));
  for (const dir of ["decisions", "actions", "questions"]) {
    fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
  }
  return marvinDir;
}

function cleanupDir(marvinDir: string): void {
  const root = path.dirname(marvinDir);
  fs.rmSync(root, { recursive: true, force: true });
}

describe("PersonaContextManager", () => {
  let ctx: PersonaContextManager;

  beforeEach(() => {
    ctx = new PersonaContextManager();
  });

  it("should start with no active persona", () => {
    expect(ctx.getActivePersona()).toBeNull();
  });

  it("should set persona by shortName", () => {
    const persona = ctx.setPersona("po");
    expect(persona).toBeDefined();
    expect(persona!.id).toBe("product-owner");
    expect(ctx.getActivePersona()!.id).toBe("product-owner");
  });

  it("should set persona by id", () => {
    const persona = ctx.setPersona("delivery-manager");
    expect(persona).toBeDefined();
    expect(persona!.shortName).toBe("dm");
  });

  it("should return undefined for unknown persona and not change state", () => {
    ctx.setPersona("po");
    const result = ctx.setPersona("unknown");
    expect(result).toBeUndefined();
    // Active persona unchanged
    expect(ctx.getActivePersona()!.id).toBe("product-owner");
  });

  it("should clear persona", () => {
    ctx.setPersona("tl");
    expect(ctx.getActivePersona()).not.toBeNull();
    ctx.clearPersona();
    expect(ctx.getActivePersona()).toBeNull();
  });

  describe("isDocumentTypeAllowed", () => {
    it("should allow everything when no persona is set", () => {
      expect(ctx.isDocumentTypeAllowed("epic")).toBe(true);
      expect(ctx.isDocumentTypeAllowed("meeting")).toBe(true);
      expect(ctx.isDocumentTypeAllowed("anything")).toBe(true);
    });

    it("should allow PO document types", () => {
      ctx.setPersona("po");
      expect(ctx.isDocumentTypeAllowed("decision")).toBe(true);
      expect(ctx.isDocumentTypeAllowed("question")).toBe(true);
      expect(ctx.isDocumentTypeAllowed("action")).toBe(true);
      expect(ctx.isDocumentTypeAllowed("feature")).toBe(true);
    });

    it("should disallow PO out-of-scope types", () => {
      ctx.setPersona("po");
      expect(ctx.isDocumentTypeAllowed("epic")).toBe(false);
      expect(ctx.isDocumentTypeAllowed("meeting")).toBe(false);
    });

    it("should allow DM broad access", () => {
      ctx.setPersona("dm");
      expect(ctx.isDocumentTypeAllowed("meeting")).toBe(true);
      expect(ctx.isDocumentTypeAllowed("epic")).toBe(true);
      expect(ctx.isDocumentTypeAllowed("feature")).toBe(true);
    });

    it("should disallow TL out-of-scope types", () => {
      ctx.setPersona("tl");
      expect(ctx.isDocumentTypeAllowed("feature")).toBe(false);
      expect(ctx.isDocumentTypeAllowed("meeting")).toBe(false);
      expect(ctx.isDocumentTypeAllowed("epic")).toBe(true);
    });
  });
});

describe("buildMcpGuidance", () => {
  let marvinDir: string;

  beforeEach(() => {
    marvinDir = createTempMarvinDir();
  });

  afterEach(() => {
    cleanupDir(marvinDir);
  });

  it("should include persona name and identity", () => {
    const ctx = new PersonaContextManager();
    const persona = ctx.setPersona("po")!;
    const guidance = buildMcpGuidance(persona, marvinDir);

    expect(guidance).toContain("Product Owner");
    expect(guidance).toContain("(po)");
  });

  it("should include focus areas", () => {
    const ctx = new PersonaContextManager();
    const persona = ctx.setPersona("tl")!;
    const guidance = buildMcpGuidance(persona, marvinDir);

    expect(guidance).toContain("Technical architecture");
    expect(guidance).toContain("Focus Areas");
  });

  it("should include allowed document types", () => {
    const ctx = new PersonaContextManager();
    const persona = ctx.setPersona("dm")!;
    const guidance = buildMcpGuidance(persona, marvinDir);

    expect(guidance).toContain("Allowed Document Types");
    expect(guidance).toContain("meeting");
    expect(guidance).toContain("epic");
  });

  it("should include behavioral instructions", () => {
    const ctx = new PersonaContextManager();
    const persona = ctx.setPersona("po")!;
    const guidance = buildMcpGuidance(persona, marvinDir);

    expect(guidance).toContain("Behavioral Instructions");
    expect(guidance).toContain("Product Owner");
    expect(guidance).toContain("Core Responsibilities");
  });
});

describe("buildPersonaSummaries", () => {
  it("should list all three personas", () => {
    const summaries = buildPersonaSummaries();

    expect(summaries).toContain("Product Owner");
    expect(summaries).toContain("Delivery Manager");
    expect(summaries).toContain("Technical Lead");
    expect(summaries).toContain("(po)");
    expect(summaries).toContain("(dm)");
    expect(summaries).toContain("(tl)");
  });

  it("should include document types for each persona", () => {
    const summaries = buildPersonaSummaries();

    expect(summaries).toContain("decision");
    expect(summaries).toContain("feature");
    expect(summaries).toContain("epic");
  });
});
