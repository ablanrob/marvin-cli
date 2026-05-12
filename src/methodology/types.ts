export type ConceptCategory = "phase" | "artifact-type" | "ritual" | "role" | "gate" | "loop";

export type Methodology = "generic-agile" | "aem";

export interface ChecklistItem {
  category: string;
  items: string[];
  appliesWhen?: string;
}

export interface ConceptDefinition {
  id: string;
  name: string;
  category: ConceptCategory;
  methodology: Methodology[];
  summary: string;
  definition: string;
  whenToUse?: string;
  checklist?: ChecklistItem[];
  relatedArtifacts?: string[];
  relatedTools?: string[];
  relatedPersonas?: string[];
  relatedConcepts?: string[];
  source: string;
}

export interface ConceptSummary {
  id: string;
  name: string;
  category: ConceptCategory;
  methodology: Methodology[];
  summary: string;
}

export interface ConceptFilter {
  category?: ConceptCategory;
  methodology?: Methodology;
}

const METHODOLOGY_ALIASES: Record<string, Methodology> = {
  "sap-aem": "aem",
  aem: "aem",
  "generic-agile": "generic-agile",
};

/** Normalize a config methodology ID (e.g. "sap-aem") to a concept-registry Methodology value ("aem"). */
export function normalizeMethodology(configValue?: string): Methodology {
  if (!configValue) return "generic-agile";
  return METHODOLOGY_ALIASES[configValue] ?? "generic-agile";
}
