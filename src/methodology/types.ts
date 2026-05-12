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
