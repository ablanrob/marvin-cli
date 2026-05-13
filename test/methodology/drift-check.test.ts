/**
 * AC1.4 — Drift check between concept registry and persona guidance.
 *
 * Validates that the methodology knowledge encoded in persona guidance
 * (DM system prompt, SAP AEM plugin fragments) stays in sync with the
 * concept registry. If a concept registry entry diverges from the prose
 * that originally seeded it, these tests fail — forcing a reconciliation
 * before merge.
 *
 * Tests use keyword matching (not exact phrases) because registry items
 * are structured labels while persona guidance is prose.
 */
import { describe, it, expect } from "vitest";
import { deliveryManager } from "../../src/personas/builtin/delivery-manager.js";
import { sapAemPlugin } from "../../src/plugins/builtin/sap-aem.js";
import { getConceptRegistry } from "../../src/methodology/registry.js";

const registry = getConceptRegistry();
const dmPrompt = deliveryManager.systemPrompt.toLowerCase();
const aemDmFragment = sapAemPlugin.promptFragments!["delivery-manager"].toLowerCase();
const aemWildcardFragment = sapAemPlugin.promptFragments!["*"].toLowerCase();

/** Extract significant keywords from a phrase (drops short filler words). */
function keywords(phrase: string): string[] {
  const stopWords = new Set(["to", "of", "the", "a", "an", "and", "or", "for", "in", "on", "with"]);
  return phrase
    .toLowerCase()
    .split(/[\s,/]+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/** Check that most keywords from a phrase appear in the text. */
function hasKeywordOverlap(text: string, phrase: string, minRatio = 0.5): boolean {
  const kw = keywords(phrase);
  if (kw.length === 0) return true;
  const matched = kw.filter((w) => text.includes(w));
  return matched.length / kw.length >= minRatio;
}

describe("Concept registry ↔ persona guidance drift check", () => {
  describe("Sprint 0 checklist vs DM persona guidance", () => {
    const sprint0 = registry.get("sprint-0")!;

    it("sprint-0 concept exists in registry", () => {
      expect(sprint0).toBeDefined();
    });

    it("DM persona mentions Sprint 0 as variable-duration bootstrapping", () => {
      expect(dmPrompt).toContain("sprint 0");
      expect(dmPrompt).toContain("variable-duration");
      expect(dmPrompt).toContain("bootstrapping");
    });

    it("DM persona states Sprint 0 exit criteria", () => {
      expect(dmPrompt).toContain("ready to start sprint 1");
    });

    const genericCategories = sprint0.checklist!.filter((c) => !c.appliesWhen);

    it("registry has the same number of generic checklist categories as DM persona sections", () => {
      // DM persona has 4 bullet groups under Sprint 0: Infrastructure, Backlog, Ceremony, Integration
      expect(genericCategories.length).toBe(4);
    });

    for (const section of genericCategories) {
      it(`DM persona covers category "${section.category}" (keyword match)`, () => {
        const matchedItems = section.items.filter((item) => hasKeywordOverlap(dmPrompt, item));
        expect(matchedItems.length).toBeGreaterThan(
          0,
          `No items from "${section.category}" found in DM persona guidance. Items: ${section.items.join(", ")}`,
        );
      });

      for (const item of section.items) {
        it(`DM persona covers "${item}" from ${section.category}`, () => {
          expect(hasKeywordOverlap(dmPrompt, item)).toBe(true);
        });
      }
    }
  });

  describe("AEM addendum vs SAP AEM DM plugin fragment", () => {
    const sprint0 = registry.get("sprint-0")!;
    const aemAddendum = sprint0.checklist!.find((c) => c.appliesWhen === "methodology=aem");

    it("AEM addendum section exists in registry", () => {
      expect(aemAddendum).toBeDefined();
    });

    it("SAP AEM DM fragment mentions Sprint 0 for AEM", () => {
      expect(aemDmFragment).toContain("sprint 0");
    });

    for (const item of aemAddendum!.items) {
      it(`SAP AEM DM fragment covers "${item}" (keyword match)`, () => {
        expect(hasKeywordOverlap(aemDmFragment, item)).toBe(true);
      });
    }
  });

  describe("AEM phases vs SAP AEM plugin wildcard fragment", () => {
    const phaseIds = ["assess-use-case", "assess-technology", "define-solution"];

    for (const phaseId of phaseIds) {
      const phase = registry.get(phaseId);

      it(`phase "${phaseId}" exists in registry`, () => {
        expect(phase).toBeDefined();
      });

      it(`SAP AEM wildcard fragment covers phase "${phase!.name}" (keyword match)`, () => {
        expect(hasKeywordOverlap(aemWildcardFragment, phase!.name)).toBe(true);
      });
    }

    it("SAP AEM wildcard fragment describes the 3-phase approach", () => {
      expect(aemWildcardFragment).toContain("3-phase");
    });
  });

  describe("AEM document types vs registry artifact-type concepts", () => {
    const aemOnlyTypes = ["use-case", "tech-assessment", "extension-design"];

    for (const typeId of aemOnlyTypes) {
      const concept = registry.get(typeId);

      it(`artifact-type "${typeId}" exists in registry as AEM-scoped`, () => {
        expect(concept).toBeDefined();
        expect(concept!.category).toBe("artifact-type");
        expect(concept!.methodology).toContain("aem");
      });

      it(`SAP AEM wildcard fragment mentions "${concept!.name}"`, () => {
        expect(aemWildcardFragment).toContain(concept!.name.toLowerCase());
      });
    }
  });

  describe("Persona roles vs registry role concepts", () => {
    const roles = ["product-owner", "delivery-manager", "tech-lead"];

    for (const roleId of roles) {
      const concept = registry.get(roleId);

      it(`role "${roleId}" exists in registry for both methodologies`, () => {
        expect(concept).toBeDefined();
        expect(concept!.category).toBe("role");
        expect(concept!.methodology).toContain("generic-agile");
        expect(concept!.methodology).toContain("aem");
      });
    }
  });
});
