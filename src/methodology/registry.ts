import type { ConceptDefinition, ConceptSummary, ConceptFilter, Methodology } from "./types.js";
import { ALL_CONCEPTS } from "./concepts/index.js";

export class ConceptRegistry {
  private readonly concepts: Map<string, ConceptDefinition>;

  constructor(definitions: ConceptDefinition[] = ALL_CONCEPTS) {
    this.concepts = new Map();
    for (const def of definitions) {
      if (this.concepts.has(def.id)) {
        throw new Error(`Duplicate concept ID: ${def.id}`);
      }
      this.concepts.set(def.id, def);
    }
  }

  get(id: string): ConceptDefinition | undefined {
    return this.concepts.get(id);
  }

  list(filter?: ConceptFilter): ConceptSummary[] {
    let results = [...this.concepts.values()];

    if (filter?.category) {
      results = results.filter((c) => c.category === filter.category);
    }

    if (filter?.methodology) {
      const meth = filter.methodology;
      results = results.filter((c) => c.methodology.includes(meth));
    }

    return results.map(toSummary);
  }

  /** Returns the full concept definition, filtering AEM-only checklist items when methodology is not AEM. */
  explain(id: string, methodology?: Methodology): ConceptDefinition | undefined {
    const concept = this.concepts.get(id);
    if (!concept) return undefined;

    if (!concept.checklist || methodology === "aem") {
      return concept;
    }

    // Filter out checklist items that require AEM when methodology is not AEM
    const filteredChecklist = concept.checklist.filter(
      (item) => !item.appliesWhen?.includes("methodology=aem"),
    );

    return { ...concept, checklist: filteredChecklist };
  }

  /** All registered concept IDs. */
  ids(): string[] {
    return [...this.concepts.keys()];
  }

  /** Total count of registered concepts. */
  get size(): number {
    return this.concepts.size;
  }
}

function toSummary(concept: ConceptDefinition): ConceptSummary {
  return {
    id: concept.id,
    name: concept.name,
    category: concept.category,
    methodology: concept.methodology,
    summary: concept.summary,
  };
}

/** Singleton registry instance used by tools. */
let defaultRegistry: ConceptRegistry | undefined;

export function getConceptRegistry(): ConceptRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ConceptRegistry();
  }
  return defaultRegistry;
}
