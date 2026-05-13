import type { ConceptDefinition } from "../types.js";

export const featureConcept: ConceptDefinition = {
  id: "feature",
  name: "Feature",
  category: "artifact-type",
  methodology: ["generic-agile", "aem"],
  summary: "Product capability defined by the Product Owner (F-xxx).",
  definition:
    "A product capability defined and prioritized by the Product Owner. Features describe what to build at a business level. They progress through draft → approved → done. Approved features are broken into implementation epics by the Tech Lead. Features have priority levels (critical, high, medium, low) to communicate business value.",
  whenToUse:
    "When defining product capabilities that need to be built. Features are the primary unit of scope from the business perspective.",
  relatedArtifacts: ["epic", "decision", "discovery"],
  relatedTools: ["create_feature", "list_features", "get_feature", "update_feature"],
  relatedPersonas: ["po"],
  relatedConcepts: ["epic", "sprint", "product-owner"],
  source: "plugin:generic-agile#feature",
};

export const epicConcept: ConceptDefinition = {
  id: "epic",
  name: "Epic",
  category: "artifact-type",
  methodology: ["generic-agile", "aem"],
  summary: "Implementation work package created by the Tech Lead, linked to a feature (E-xxx).",
  definition:
    "An implementation work package created by the Tech Lead, linked to an approved feature. Epics break features into deliverable chunks with effort estimates and target dates. They progress through planned → in-progress → done. Epics must link to approved features — the system enforces this.",
  whenToUse:
    "When breaking approved features into implementation work. Each epic should have a clear scope and definition of done.",
  relatedArtifacts: ["feature", "task", "sprint"],
  relatedTools: ["create_epic", "list_epics", "get_epic", "update_epic"],
  relatedPersonas: ["tl"],
  relatedConcepts: ["feature", "task", "sprint", "tech-lead"],
  source: "plugin:generic-agile#epic",
};

export const taskConcept: ConceptDefinition = {
  id: "task",
  name: "Task",
  category: "artifact-type",
  methodology: ["generic-agile", "aem"],
  summary: "Concrete implementation item linked to an epic (T-xxx).",
  definition:
    "A concrete implementation item created by the Tech Lead, linked to an epic. Tasks are the smallest unit of trackable work. They progress through backlog → ready → in-progress → review → done. Tasks include acceptance criteria, complexity estimates, and estimated points.",
  whenToUse:
    "When breaking epics into concrete implementation items that individual developers can pick up.",
  relatedArtifacts: ["epic"],
  relatedTools: ["create_task", "list_tasks", "get_task", "update_task"],
  relatedPersonas: ["tl"],
  relatedConcepts: ["epic", "sprint", "tech-lead"],
  source: "plugin:generic-agile#task",
};

export const sprintConcept: ConceptDefinition = {
  id: "sprint",
  name: "Sprint",
  category: "artifact-type",
  methodology: ["generic-agile", "aem"],
  summary: "Time-boxed iteration that groups epics and work items (SP-xxx).",
  definition:
    "A time-boxed iteration that groups epics and work items with delivery dates. Sprints have start/end dates, goals, and linked epics. They progress through planned → active → completed (or cancelled). Work items are associated with sprints via sprint:SP-xxx tags. The Delivery Manager owns sprint planning and tracking.",
  whenToUse:
    "When organizing work into delivery iterations. Use Sprint 0 for project bootstrapping.",
  relatedArtifacts: ["epic", "action", "task"],
  relatedTools: [
    "create_sprint",
    "list_sprints",
    "get_sprint",
    "update_sprint",
    "generate_sprint_progress",
  ],
  relatedPersonas: ["dm"],
  relatedConcepts: ["sprint-0", "epic", "delivery-manager"],
  source: "plugin:generic-agile#sprint",
};

export const decisionConcept: ConceptDefinition = {
  id: "decision",
  name: "Decision",
  category: "artifact-type",
  methodology: ["generic-agile", "aem"],
  summary: "Recorded project decision with rationale and status (D-xxx).",
  definition:
    "A recorded project decision with rationale, status, and optional alternatives considered. Decisions provide an audit trail of why choices were made. They progress through proposed → accepted (or rejected/deferred). All personas can create decisions, but the DM ensures they are properly documented.",
  whenToUse:
    "When the team makes a significant choice that should be recorded for traceability — architectural decisions, tool choices, process changes, scope changes.",
  relatedArtifacts: ["action", "question"],
  relatedTools: ["create_decision", "list_decisions", "get_decision", "update_decision"],
  relatedPersonas: ["po", "dm", "tl"],
  relatedConcepts: ["action", "question"],
  source: "core#decision",
};

export const actionConcept: ConceptDefinition = {
  id: "action",
  name: "Action",
  category: "artifact-type",
  methodology: ["generic-agile", "aem"],
  summary: "Tracked work item with owner and due date (A-xxx).",
  definition:
    "A tracked work item with an owner, due date, and optional sprint assignment. Actions are the general-purpose unit for tracking work that needs to happen. They progress through open → in-progress → done (or cancelled). Actions support sprint assignment via the sprints parameter, which auto-generates sprint:SP-xxx tags. Overdue actions are flagged in GAR reports.",
  whenToUse:
    "When tracking any work that needs to happen — setup tasks, follow-ups, risk mitigations, meeting outcomes. More general than tasks (which are implementation-specific).",
  relatedArtifacts: ["decision", "sprint"],
  relatedTools: [
    "create_action",
    "list_actions",
    "get_action",
    "update_action",
    "suggest_sprints_for_action",
  ],
  relatedPersonas: ["po", "dm", "tl"],
  relatedConcepts: ["sprint", "decision"],
  source: "core#action",
};

export const questionConcept: ConceptDefinition = {
  id: "question",
  name: "Question",
  category: "artifact-type",
  methodology: ["generic-agile", "aem"],
  summary: "Open question requiring resolution (Q-xxx).",
  definition:
    "An open question requiring resolution, with optional assignee and answer. Questions track uncertainties and knowledge gaps. They progress through open → answered (or deferred). Unresolved questions are surfaced in risk registers. Discovery session gaps can auto-spawn linked questions.",
  whenToUse:
    "When there is an uncertainty or knowledge gap that needs to be resolved before work can proceed.",
  relatedArtifacts: ["decision", "discovery"],
  relatedTools: ["create_question", "list_questions", "get_question", "update_question"],
  relatedPersonas: ["po", "dm", "tl"],
  relatedConcepts: ["decision", "discovery"],
  source: "core#question",
};

export const meetingConcept: ConceptDefinition = {
  id: "meeting",
  name: "Meeting",
  category: "artifact-type",
  methodology: ["generic-agile", "aem"],
  summary: "Meeting record with attendees, agenda, and extracted outcomes (M-xxx).",
  definition:
    "A meeting record with attendees, date, agenda, and notes. Meetings can be analyzed to extract decisions, actions, and questions as governance artifacts. The meeting date is required metadata. Meetings progress through scheduled → completed → cancelled.",
  whenToUse:
    "When recording meeting discussions, decisions, and action items for audit trail and follow-up.",
  relatedArtifacts: ["decision", "action", "question"],
  relatedTools: [
    "create_meeting",
    "list_meetings",
    "get_meeting",
    "update_meeting",
    "analyze_meeting",
  ],
  relatedPersonas: ["po", "dm", "tl"],
  relatedConcepts: ["action", "decision"],
  source: "plugin:generic-agile#meeting",
};

export const reportConcept: ConceptDefinition = {
  id: "report",
  name: "Report",
  category: "artifact-type",
  methodology: ["generic-agile", "aem"],
  summary: "Persisted project report for audit trail (R-xxx).",
  definition:
    "A persisted project report generated from current artifact state. Report types include status reports, risk registers, GAR (Green-Amber-Red) reports, epic progress, feature progress, and sprint progress. Reports are generated on-demand and optionally saved as documents for historical tracking.",
  whenToUse:
    "When creating stakeholder updates, tracking project health, or building an audit trail of project status over time.",
  relatedArtifacts: ["sprint", "epic", "feature", "action"],
  relatedTools: [
    "generate_status_report",
    "generate_risk_register",
    "generate_gar_report",
    "save_report",
  ],
  relatedPersonas: ["dm"],
  relatedConcepts: ["sprint", "delivery-manager"],
  source: "plugin:generic-agile#report",
};

export const contributionConcept: ConceptDefinition = {
  id: "contribution",
  name: "Contribution",
  category: "artifact-type",
  methodology: ["generic-agile", "aem"],
  summary: "Structured persona input outside of meetings (C-xxx).",
  definition:
    "A structured input from a persona outside of meetings — such as action results, spike findings, stakeholder feedback, or risk findings. Contributions are analyzed to produce governance effects (new decisions, updated actions, etc.). Each persona has specific contribution types available.",
  whenToUse:
    "When a persona has structured input to provide outside of a meeting context — test results, research findings, stakeholder feedback, risk assessments.",
  relatedArtifacts: ["action", "decision"],
  relatedTools: [
    "create_contribution",
    "list_contributions",
    "get_contribution",
    "update_contribution",
  ],
  relatedPersonas: ["po", "dm", "tl"],
  relatedConcepts: ["action", "decision"],
  source: "plugin:generic-agile#contribution",
};

export const useCaseConcept: ConceptDefinition = {
  id: "use-case",
  name: "Use Case",
  category: "artifact-type",
  methodology: ["aem"],
  summary: "Business scenario requiring SAP BTP extension (UC-xxx).",
  definition:
    "A business scenario requiring extension on SAP BTP, defined by the Product Owner in AEM Phase 1. Each use case is classified by extension type (in-app, side-by-side, hybrid) and priority. Use cases progress through draft → assessed → approved → deferred. Approved use cases move to technology assessment in Phase 2.",
  whenToUse:
    "In AEM projects, when defining business scenarios that need SAP BTP extension capabilities.",
  relatedArtifacts: ["tech-assessment", "feature", "discovery"],
  relatedTools: ["create_use_case", "list_use_cases", "get_use_case", "update_use_case"],
  relatedPersonas: ["po"],
  relatedConcepts: ["assess-use-case", "tech-assessment", "product-owner"],
  source: "plugin:sap-aem#use-case",
};

export const techAssessmentConcept: ConceptDefinition = {
  id: "tech-assessment",
  name: "Tech Assessment",
  category: "artifact-type",
  methodology: ["aem"],
  summary: "Technology evaluation linked to a use case (TA-xxx).",
  definition:
    "A technology evaluation linked to an assessed/approved use case, created by the Tech Lead in AEM Phase 2. Evaluates BTP services, extension points, and feasibility. Tech assessments progress through draft → evaluated → recommended → rejected. The system enforces that the linked use case must be assessed or approved.",
  whenToUse: "In AEM Phase 2, when evaluating BTP technologies for approved use cases.",
  relatedArtifacts: ["use-case", "extension-design"],
  relatedTools: [
    "create_tech_assessment",
    "list_tech_assessments",
    "get_tech_assessment",
    "update_tech_assessment",
  ],
  relatedPersonas: ["tl"],
  relatedConcepts: ["assess-technology", "use-case", "extension-design", "tech-lead"],
  source: "plugin:sap-aem#tech-assessment",
};

export const extensionDesignConcept: ConceptDefinition = {
  id: "extension-design",
  name: "Extension Design",
  category: "artifact-type",
  methodology: ["aem"],
  summary: "Architecture design linked to a tech assessment (XD-xxx).",
  definition:
    "An architecture design linked to a recommended tech assessment, created by the Tech Lead in AEM Phase 3. Defines architecture pattern, BTP services, and integration points. Extension designs progress through draft → designed → validated → approved. The system enforces that the linked tech assessment must be recommended.",
  whenToUse:
    "In AEM Phase 3, when designing the extension architecture for recommended technologies.",
  relatedArtifacts: ["tech-assessment", "epic"],
  relatedTools: [
    "create_extension_design",
    "list_extension_designs",
    "get_extension_design",
    "update_extension_design",
  ],
  relatedPersonas: ["tl"],
  relatedConcepts: ["define-solution", "tech-assessment", "epic", "tech-lead"],
  source: "plugin:sap-aem#extension-design",
};

export const discoveryConcept: ConceptDefinition = {
  id: "discovery",
  name: "Discovery Session",
  category: "artifact-type",
  methodology: ["generic-agile", "aem"],
  summary: "Stakeholder elicitation session for requirements validation (DS-xxx).",
  definition:
    "A structured stakeholder elicitation session for validating requirements and identifying gaps. Discoveries capture findings and gaps during sessions. Gaps can auto-spawn linked questions (Q-xxx). Sessions progress through draft → in-review → needs-input → accepted (or parked). Sessions can be chained via parent references to carry forward open gaps.",
  whenToUse:
    "When validating requirements with stakeholders, identifying gaps in understanding, or refining features/use cases before committing to implementation.",
  relatedArtifacts: ["question", "feature", "use-case"],
  relatedTools: [
    "start_discovery",
    "record_finding",
    "record_gap",
    "complete_discovery",
    "list_discoveries",
    "get_discovery",
  ],
  relatedPersonas: ["po", "dm", "tl"],
  relatedConcepts: ["feature", "use-case", "question"],
  source: "plugin:generic-agile#discovery",
};

export const artifactTypeConcepts: ConceptDefinition[] = [
  featureConcept,
  epicConcept,
  taskConcept,
  sprintConcept,
  decisionConcept,
  actionConcept,
  questionConcept,
  meetingConcept,
  reportConcept,
  contributionConcept,
  useCaseConcept,
  techAssessmentConcept,
  extensionDesignConcept,
  discoveryConcept,
];
