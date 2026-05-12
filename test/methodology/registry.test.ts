import { describe, it, expect } from "vitest";
import { ConceptRegistry } from "../../src/methodology/registry.js";
import { ALL_CONCEPTS } from "../../src/methodology/concepts/index.js";
import type { ConceptDefinition } from "../../src/methodology/types.js";

describe("ConceptRegistry", () => {
  it("loads all built-in concepts without duplicates", () => {
    const registry = new ConceptRegistry();
    expect(registry.size).toBe(ALL_CONCEPTS.length);
    expect(registry.size).toBeGreaterThanOrEqual(20);
  });

  it("rejects duplicate concept IDs", () => {
    const dupe: ConceptDefinition = {
      id: "sprint-0",
      name: "Duplicate",
      category: "ritual",
      methodology: ["generic-agile"],
      summary: "dupe",
      definition: "dupe",
      source: "test",
    };
    expect(() => new ConceptRegistry([...ALL_CONCEPTS, dupe])).toThrow("Duplicate concept ID");
  });

  describe("get()", () => {
    it("returns a concept by ID", () => {
      const registry = new ConceptRegistry();
      const sprint0 = registry.get("sprint-0");
      expect(sprint0).toBeDefined();
      expect(sprint0!.name).toBe("Sprint 0");
      expect(sprint0!.category).toBe("ritual");
    });

    it("returns undefined for unknown ID", () => {
      const registry = new ConceptRegistry();
      expect(registry.get("nonexistent-id")).toBeUndefined();
    });
  });

  describe("list()", () => {
    it("returns all concepts with no filter", () => {
      const registry = new ConceptRegistry();
      const all = registry.list();
      expect(all.length).toBe(ALL_CONCEPTS.length);
    });

    it("filters by category", () => {
      const registry = new ConceptRegistry();
      const phases = registry.list({ category: "phase" });
      expect(phases.length).toBe(3);
      for (const p of phases) {
        expect(p.category).toBe("phase");
      }
    });

    it("filters by methodology", () => {
      const registry = new ConceptRegistry();
      const aemOnly = registry.list({ methodology: "aem" });
      for (const c of aemOnly) {
        expect(c.methodology).toContain("aem");
      }

      const genericOnly = registry.list({ methodology: "generic-agile" });
      for (const c of genericOnly) {
        expect(c.methodology).toContain("generic-agile");
      }

      // AEM-only concepts should not appear in generic-agile list
      const aemExclusive = aemOnly.filter((c) => !c.methodology.includes("generic-agile"));
      expect(aemExclusive.length).toBeGreaterThan(0);
      for (const c of aemExclusive) {
        expect(genericOnly.find((g) => g.id === c.id)).toBeUndefined();
      }
    });

    it("combines category and methodology filters", () => {
      const registry = new ConceptRegistry();
      const aemPhases = registry.list({ category: "phase", methodology: "aem" });
      expect(aemPhases.length).toBe(3);

      // Phases are AEM-only, so generic-agile should return none
      const agilePhases = registry.list({ category: "phase", methodology: "generic-agile" });
      expect(agilePhases.length).toBe(0);
    });

    it("returns summary shape (no definition field)", () => {
      const registry = new ConceptRegistry();
      const summaries = registry.list();
      for (const s of summaries) {
        expect(s).toHaveProperty("id");
        expect(s).toHaveProperty("name");
        expect(s).toHaveProperty("category");
        expect(s).toHaveProperty("methodology");
        expect(s).toHaveProperty("summary");
        expect(s).not.toHaveProperty("definition");
        expect(s).not.toHaveProperty("checklist");
      }
    });
  });

  describe("explain()", () => {
    it("returns full concept definition", () => {
      const registry = new ConceptRegistry();
      const sprint0 = registry.explain("sprint-0");
      expect(sprint0).toBeDefined();
      expect(sprint0!.definition).toBeTruthy();
      expect(sprint0!.checklist).toBeDefined();
      expect(sprint0!.checklist!.length).toBeGreaterThanOrEqual(4);
    });

    it("returns undefined for unknown ID", () => {
      const registry = new ConceptRegistry();
      expect(registry.explain("nonexistent")).toBeUndefined();
    });

    it("includes AEM addendum when methodology is aem", () => {
      const registry = new ConceptRegistry();
      const sprint0 = registry.explain("sprint-0", "aem");
      expect(sprint0).toBeDefined();
      const aemSection = sprint0!.checklist!.find((c) => c.category === "aem-addendum");
      expect(aemSection).toBeDefined();
      expect(aemSection!.items).toContain("phase gate checklists");
    });

    it("excludes AEM addendum when methodology is generic-agile", () => {
      const registry = new ConceptRegistry();
      const sprint0 = registry.explain("sprint-0", "generic-agile");
      expect(sprint0).toBeDefined();
      const aemSection = sprint0!.checklist!.find((c) => c.category === "aem-addendum");
      expect(aemSection).toBeUndefined();
      expect(sprint0!.checklist!.length).toBe(4);
    });

    it("excludes AEM addendum when no methodology specified", () => {
      const registry = new ConceptRegistry();
      const sprint0 = registry.explain("sprint-0");
      expect(sprint0).toBeDefined();
      // Without methodology, we filter out AEM-only items (default behavior)
      const aemSection = sprint0!.checklist!.find((c) => c.category === "aem-addendum");
      expect(aemSection).toBeUndefined();
    });
  });

  describe("AC1.1 — required concepts exist", () => {
    const registry = new ConceptRegistry();

    const requiredConcepts = [
      "sprint-0",
      "assess-use-case",
      "assess-technology",
      "define-solution",
      "phase-gate",
      "iterative-loop",
    ];

    const requiredArtifactTypes = [
      "feature",
      "epic",
      "task",
      "sprint",
      "decision",
      "action",
      "question",
      "meeting",
      "report",
      "use-case",
      "tech-assessment",
      "extension-design",
      "discovery",
      "contribution",
    ];

    const requiredRoles = ["product-owner", "delivery-manager", "tech-lead"];

    for (const id of requiredConcepts) {
      it(`has concept: ${id}`, () => {
        expect(registry.get(id)).toBeDefined();
      });
    }

    for (const id of requiredArtifactTypes) {
      it(`has artifact type: ${id}`, () => {
        const concept = registry.get(id);
        expect(concept).toBeDefined();
        expect(concept!.category).toBe("artifact-type");
      });
    }

    for (const id of requiredRoles) {
      it(`has role: ${id}`, () => {
        const concept = registry.get(id);
        expect(concept).toBeDefined();
        expect(concept!.category).toBe("role");
      });
    }
  });

  describe("concept data integrity", () => {
    const registry = new ConceptRegistry();

    it("all concepts have unique IDs", () => {
      const ids = registry.ids();
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("all concept IDs are kebab-case", () => {
      for (const id of registry.ids()) {
        expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      }
    });

    it("all concepts have a non-empty source", () => {
      for (const id of registry.ids()) {
        const concept = registry.get(id)!;
        expect(concept.source).toBeTruthy();
      }
    });

    it("all concepts have at least one methodology", () => {
      for (const id of registry.ids()) {
        const concept = registry.get(id)!;
        expect(concept.methodology.length).toBeGreaterThan(0);
      }
    });
  });
});
