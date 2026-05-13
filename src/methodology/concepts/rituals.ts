import type { ConceptDefinition } from "../types.js";

export const sprint0: ConceptDefinition = {
  id: "sprint-0",
  name: "Sprint 0",
  category: "ritual",
  methodology: ["generic-agile", "aem"],
  summary: "Variable-duration bootstrapping phase before regular sprints begin.",
  definition:
    "A variable-duration bootstrapping phase that runs before regular sprints begin. Not time-boxed like a normal sprint. Sprint 0 ends when the team is ready to start Sprint 1 with a refined backlog and working infrastructure.",
  whenToUse:
    "When a project has work items (features, actions) but no sprints recorded yet, OR when starting a new AEM extension project.",
  checklist: [
    {
      category: "infrastructure-provisioning",
      items: ["CI/CD setup", "repositories", "cloud services", "dev environments"],
    },
    {
      category: "backlog-refinement",
      items: ["transition features to epics", "acceptance criteria", "estimates"],
    },
    {
      category: "ceremony-scheduling",
      items: ["standup cadence", "refinement sessions", "reviews"],
    },
    {
      category: "integration-setup",
      items: ["Jira", "Confluence", "other tool connections"],
    },
    {
      category: "aem-addendum",
      items: [
        "phase gate checklists",
        "BTP service access",
        "extension design templates",
        "iterative loop definitions",
      ],
      appliesWhen: "methodology=aem",
    },
  ],
  relatedArtifacts: ["sprint", "action", "task", "decision"],
  relatedTools: ["create_sprint", "bootstrap_sprint_zero", "get_started"],
  relatedPersonas: ["dm"],
  relatedConcepts: ["assess-use-case", "phase-gate", "iterative-loop"],
  source: "persona:dm#sprint-0",
};

export const phaseGate: ConceptDefinition = {
  id: "phase-gate",
  name: "Phase Gate",
  category: "gate",
  methodology: ["aem"],
  summary: "Soft checkpoint between AEM phases that validates artifact readiness.",
  definition:
    "A soft checkpoint between AEM phases. Before advancing from one phase to the next, the system checks that prerequisite artifacts are in the expected status. Phase gates use soft enforcement — they warn about incomplete artifacts but do not block progression. The Delivery Manager is responsible for managing phase gate transitions.",
  whenToUse:
    "When the team believes they have completed the work for the current AEM phase and want to advance to the next one.",
  relatedArtifacts: ["use-case", "tech-assessment", "extension-design"],
  relatedTools: ["advance_phase", "get_current_phase", "generate_phase_status"],
  relatedPersonas: ["dm"],
  relatedConcepts: ["assess-use-case", "assess-technology", "define-solution"],
  source: "plugin:sap-aem#phase-gate",
};

export const iterativeLoop: ConceptDefinition = {
  id: "iterative-loop",
  name: "Iterative Loop",
  category: "loop",
  methodology: ["aem"],
  summary: "Feedback loops between AEM phases allowing revisiting earlier work.",
  definition:
    "The iterative loops between AEM phases that allow teams to revisit earlier work as new information emerges. Unlike a strict waterfall, AEM phases can feed back: findings in Assess Technology may require revisiting use cases, and Define Solution work may reveal technology gaps. These loops are mapped during Sprint 0 and managed by the Delivery Manager.",
  whenToUse:
    "When work in a later AEM phase reveals gaps or changes that affect earlier-phase artifacts (e.g., a tech assessment reveals a use case needs revision).",
  relatedArtifacts: ["use-case", "tech-assessment", "extension-design"],
  relatedTools: ["get_current_phase"],
  relatedPersonas: ["dm"],
  relatedConcepts: ["assess-use-case", "assess-technology", "define-solution", "phase-gate"],
  source: "plugin:sap-aem#iterative-loop",
};

export const ritualConcepts: ConceptDefinition[] = [sprint0, phaseGate, iterativeLoop];
