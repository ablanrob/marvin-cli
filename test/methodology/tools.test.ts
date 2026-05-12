import { describe, it, expect } from "vitest";
import { createConceptTools } from "../../src/methodology/tools.js";
import type { MarvinProjectConfig } from "../../src/core/config.js";

function extractHandler(tools: any[], name: string): (args: any) => Promise<any> {
  const t = tools.find((tool) => tool.name === name);
  if (!t) throw new Error(`Tool "${name}" not found`);
  return (t as any).handler;
}

function parseResult(result: any): any {
  return JSON.parse(result.content[0].text);
}

describe("Concept tools", () => {
  describe("list_concepts", () => {
    it("returns all concepts for the project methodology", async () => {
      const tools = createConceptTools({
        name: "test",
        methodology: "generic-agile",
      } as MarvinProjectConfig);
      const handler = extractHandler(tools, "list_concepts");

      const result = await handler({});
      const data = parseResult(result);
      expect(data.concepts).toBeDefined();
      expect(data.concepts.length).toBeGreaterThan(0);

      // All returned concepts should include generic-agile
      for (const c of data.concepts) {
        expect(c.methodology).toContain("generic-agile");
      }
    });

    it("filters by category", async () => {
      const tools = createConceptTools({ name: "test", methodology: "aem" } as MarvinProjectConfig);
      const handler = extractHandler(tools, "list_concepts");

      const result = await handler({ category: "phase" });
      const data = parseResult(result);
      expect(data.concepts.length).toBe(3);
      for (const c of data.concepts) {
        expect(c.category).toBe("phase");
      }
    });

    it("filters by explicit methodology override", async () => {
      const tools = createConceptTools({
        name: "test",
        methodology: "generic-agile",
      } as MarvinProjectConfig);
      const handler = extractHandler(tools, "list_concepts");

      const result = await handler({ methodology: "aem" });
      const data = parseResult(result);
      // AEM filter should return AEM-specific concepts
      const aemOnly = data.concepts.filter((c: any) => !c.methodology.includes("generic-agile"));
      expect(aemOnly.length).toBeGreaterThan(0);
    });

    it("returns summary shape without definition field", async () => {
      const tools = createConceptTools({ name: "test" } as MarvinProjectConfig);
      const handler = extractHandler(tools, "list_concepts");

      const result = await handler({});
      const data = parseResult(result);
      for (const c of data.concepts) {
        expect(c).toHaveProperty("id");
        expect(c).toHaveProperty("name");
        expect(c).toHaveProperty("summary");
        expect(c).not.toHaveProperty("definition");
      }
    });
  });

  describe("explain_concept", () => {
    it("returns full definition for a valid concept", async () => {
      const tools = createConceptTools({ name: "test", methodology: "aem" } as MarvinProjectConfig);
      const handler = extractHandler(tools, "explain_concept");

      const result = await handler({ id: "sprint-0" });
      expect(result.isError).toBeFalsy();

      const data = parseResult(result);
      expect(data.id).toBe("sprint-0");
      expect(data.name).toBe("Sprint 0");
      expect(data.definition).toBeTruthy();
      expect(data.whenToUse).toBeTruthy();
      expect(data.checklist).toBeDefined();
      expect(data.relatedArtifacts).toBeDefined();
      expect(data.relatedTools).toBeDefined();
      expect(data.relatedPersonas).toBeDefined();
      expect(data.relatedConcepts).toBeDefined();
      expect(data.source).toBe("persona:dm#sprint-0");
    });

    it("includes AEM addendum when methodology is aem", async () => {
      const tools = createConceptTools({ name: "test", methodology: "aem" } as MarvinProjectConfig);
      const handler = extractHandler(tools, "explain_concept");

      const result = await handler({ id: "sprint-0" });
      const data = parseResult(result);
      const aemSection = data.checklist.find((c: any) => c.category === "aem-addendum");
      expect(aemSection).toBeDefined();
    });

    it("excludes AEM addendum when methodology is generic-agile", async () => {
      const tools = createConceptTools({
        name: "test",
        methodology: "generic-agile",
      } as MarvinProjectConfig);
      const handler = extractHandler(tools, "explain_concept");

      const result = await handler({ id: "sprint-0" });
      const data = parseResult(result);
      const aemSection = data.checklist.find((c: any) => c.category === "aem-addendum");
      expect(aemSection).toBeUndefined();
    });

    it("returns error for nonexistent concept", async () => {
      const tools = createConceptTools({ name: "test" } as MarvinProjectConfig);
      const handler = extractHandler(tools, "explain_concept");

      const result = await handler({ id: "nonexistent-id" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
      expect(result.content[0].text).toContain("list_concepts");
    });

    it("omits undefined optional fields", async () => {
      const tools = createConceptTools({ name: "test", methodology: "aem" } as MarvinProjectConfig);
      const handler = extractHandler(tools, "explain_concept");

      const result = await handler({ id: "phase-gate" });
      const data = parseResult(result);
      // phase-gate has no checklist
      expect(data.checklist).toBeUndefined();
    });
  });

  describe("explain_phase", () => {
    it("finds phase by ID", async () => {
      const tools = createConceptTools({ name: "test", methodology: "aem" } as MarvinProjectConfig);
      const handler = extractHandler(tools, "explain_phase");

      const result = await handler({ name: "assess-use-case" });
      expect(result.isError).toBeFalsy();
      const data = parseResult(result);
      expect(data.id).toBe("assess-use-case");
      expect(data.category).toBe("phase");
    });

    it("finds phase by human name (case-insensitive)", async () => {
      const tools = createConceptTools({ name: "test", methodology: "aem" } as MarvinProjectConfig);
      const handler = extractHandler(tools, "explain_phase");

      const result = await handler({ name: "Assess Use Case" });
      expect(result.isError).toBeFalsy();
      const data = parseResult(result);
      expect(data.id).toBe("assess-use-case");
    });

    it("finds phase by lowercase human name", async () => {
      const tools = createConceptTools({ name: "test", methodology: "aem" } as MarvinProjectConfig);
      const handler = extractHandler(tools, "explain_phase");

      const result = await handler({ name: "define solution" });
      expect(result.isError).toBeFalsy();
      const data = parseResult(result);
      expect(data.id).toBe("define-solution");
    });

    it("returns error for non-phase concept", async () => {
      const tools = createConceptTools({ name: "test" } as MarvinProjectConfig);
      const handler = extractHandler(tools, "explain_phase");

      const result = await handler({ name: "sprint-0" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ritual");
      expect(result.content[0].text).toContain("not a phase");
    });

    it("returns error for unknown phase", async () => {
      const tools = createConceptTools({ name: "test" } as MarvinProjectConfig);
      const handler = extractHandler(tools, "explain_phase");

      const result = await handler({ name: "nonexistent-phase" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("tool registration", () => {
    it("creates exactly 3 tools", () => {
      const tools = createConceptTools();
      expect(tools.length).toBe(3);
    });

    it("all tools have correct names", () => {
      const tools = createConceptTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain("list_concepts");
      expect(names).toContain("explain_concept");
      expect(names).toContain("explain_phase");
    });
  });
});
