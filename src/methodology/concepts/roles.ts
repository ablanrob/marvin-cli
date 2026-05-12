import type { ConceptDefinition } from "../types.js";

export const productOwnerConcept: ConceptDefinition = {
  id: "product-owner",
  name: "Product Owner",
  category: "role",
  methodology: ["generic-agile", "aem"],
  summary: "Defines product vision, manages backlog, and prioritizes features.",
  definition:
    "The Product Owner defines product vision, manages the backlog, and prioritizes features (or use cases in AEM). Responsible for ensuring the team builds the right things. In AEM, the PO is the Business Process Owner who defines and justifies extension use cases. The PO creates features, conducts discovery sessions with stakeholders, and approves scope.",
  whenToUse:
    "When defining what to build, prioritizing work, validating requirements with stakeholders, or approving features for implementation.",
  relatedArtifacts: ["feature", "use-case", "discovery", "decision"],
  relatedTools: ["create_feature", "create_use_case", "start_discovery", "set_persona"],
  relatedPersonas: ["po"],
  relatedConcepts: ["feature", "use-case", "discovery", "delivery-manager", "tech-lead"],
  source: "persona:product-owner",
};

export const deliveryManagerConcept: ConceptDefinition = {
  id: "delivery-manager",
  name: "Delivery Manager",
  category: "role",
  methodology: ["generic-agile", "aem"],
  summary: "Manages delivery, risks, sprints, and governance processes.",
  definition:
    "The Delivery Manager ensures the project is delivered on time, within scope, and with managed risks. Tracks progress, manages sprints, coordinates between team members, and ensures governance processes are followed. In AEM, the DM also manages phase gate transitions and generates extension portfolio reports. Responsible for Sprint 0 bootstrapping.",
  whenToUse:
    "When planning sprints, tracking progress, managing risks, running health checks, generating reports, or facilitating governance processes.",
  relatedArtifacts: ["sprint", "action", "report", "meeting"],
  relatedTools: [
    "create_sprint",
    "generate_status_report",
    "generate_risk_register",
    "bootstrap_sprint_zero",
    "set_persona",
  ],
  relatedPersonas: ["dm"],
  relatedConcepts: ["sprint", "sprint-0", "product-owner", "tech-lead"],
  source: "persona:delivery-manager",
};

export const techLeadConcept: ConceptDefinition = {
  id: "tech-lead",
  name: "Tech Lead",
  category: "role",
  methodology: ["generic-agile", "aem"],
  summary: "Owns technical architecture, breaks features into epics and tasks.",
  definition:
    "The Tech Lead owns technical architecture, code quality, and technical decisions. Breaks approved features into implementation epics and tasks. In AEM, the TL is the Solution Architect who evaluates BTP technologies (Phase 2) and designs extension architecture (Phase 3). Creates tech assessments and extension designs.",
  whenToUse:
    "When making architectural decisions, breaking features into implementation work, evaluating technologies, or designing solutions.",
  relatedArtifacts: ["epic", "task", "tech-assessment", "extension-design", "decision"],
  relatedTools: [
    "create_epic",
    "create_task",
    "create_tech_assessment",
    "create_extension_design",
    "set_persona",
  ],
  relatedPersonas: ["tl"],
  relatedConcepts: ["epic", "task", "product-owner", "delivery-manager"],
  source: "persona:tech-lead",
};

export const roleConcepts: ConceptDefinition[] = [
  productOwnerConcept,
  deliveryManagerConcept,
  techLeadConcept,
];
