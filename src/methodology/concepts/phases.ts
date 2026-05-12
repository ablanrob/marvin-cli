import type { ConceptDefinition } from "../types.js";

export const assessUseCase: ConceptDefinition = {
  id: "assess-use-case",
  name: "Assess Use Case",
  category: "phase",
  methodology: ["aem"],
  summary: "First AEM phase — validate the extension scenario with business stakeholders.",
  definition:
    "The first phase of the SAP Application Extension Methodology (AEM). The team defines and justifies business scenarios needing extension on SAP BTP. The Product Owner creates use cases (UC-xxx) classified by extension type (in-app, side-by-side, hybrid) and priority. Use cases progress from draft to assessed to approved before the project can advance to Phase 2.",
  whenToUse:
    "At the start of any AEM extension project, before evaluating technologies or designing solutions.",
  relatedArtifacts: ["use-case", "feature", "discovery"],
  relatedTools: ["create_use_case", "get_current_phase", "advance_phase"],
  relatedPersonas: ["po"],
  relatedConcepts: ["assess-technology", "phase-gate", "use-case"],
  source: "plugin:sap-aem#phase-1",
};

export const assessTechnology: ConceptDefinition = {
  id: "assess-technology",
  name: "Assess Technology",
  category: "phase",
  methodology: ["aem"],
  summary: "Second AEM phase — evaluate BTP technologies and extension points.",
  definition:
    "The second phase of AEM. The Tech Lead evaluates BTP technologies and extension points for each approved use case. Tech assessments (TA-xxx) are created, linking to assessed/approved use cases and documenting BTP service feasibility. Assessments progress from draft to evaluated to recommended (or rejected) before the project can advance to Phase 3.",
  whenToUse:
    "After use cases are assessed/approved in Phase 1. Requires approved use cases before tech assessments can be created.",
  relatedArtifacts: ["tech-assessment", "use-case"],
  relatedTools: ["create_tech_assessment", "get_current_phase", "advance_phase"],
  relatedPersonas: ["tl"],
  relatedConcepts: ["assess-use-case", "define-solution", "phase-gate", "tech-assessment"],
  source: "plugin:sap-aem#phase-2",
};

export const defineSolution: ConceptDefinition = {
  id: "define-solution",
  name: "Define Solution",
  category: "phase",
  methodology: ["aem"],
  summary: "Third AEM phase — design the extension architecture.",
  definition:
    "The third and final phase of AEM. The Tech Lead designs the extension architecture for recommended technologies. Extension designs (XD-xxx) are created, linking to recommended tech assessments and documenting architecture patterns, BTP services, and integration points. Designs progress from draft to designed to validated to approved.",
  whenToUse:
    "After tech assessments are recommended in Phase 2. Requires recommended tech assessments before extension designs can be created.",
  relatedArtifacts: ["extension-design", "tech-assessment", "epic"],
  relatedTools: ["create_extension_design", "get_current_phase", "advance_phase"],
  relatedPersonas: ["tl"],
  relatedConcepts: ["assess-technology", "phase-gate", "extension-design"],
  source: "plugin:sap-aem#phase-3",
};

export const phaseConcepts: ConceptDefinition[] = [assessUseCase, assessTechnology, defineSolution];
