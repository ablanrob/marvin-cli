import type { DocumentStore } from "../storage/store.js";
import type { MarvinProjectConfig } from "../core/config.js";
import type { SourceManifestManager } from "../sources/manifest.js";
import type { Methodology, ChecklistItem } from "./types.js";
import { normalizeMethodology } from "./types.js";
import { getConceptRegistry } from "./registry.js";
import { ConfigError } from "../core/errors.js";

export type BootstrapStep = "survey" | "draft" | "populate" | "review" | "commit";

export type BootstrapSection =
  | "infrastructure-provisioning"
  | "backlog-refinement"
  | "ceremony-scheduling"
  | "integration-setup"
  | "aem-addendum";

export interface SurveyResult {
  step: "survey";
  projectState: {
    methodology: string;
    existingSprints: number;
    featuresCount: number;
    actionsCount: number;
    decisionsCount: number;
    integrationsConfigured: { jira: boolean; confluence: boolean };
  };
  alreadySatisfied: { item: string; evidence: string }[];
  nextStep: "draft";
}

export interface DraftResult {
  step: "draft";
  sprintDraft: {
    idSuggested: string;
    title: string;
    goal: string;
    startDate: null;
    endDate: null;
    type: "sprint";
    tags: string[];
  };
  nextStep: "populate";
}

export interface ProposedItem {
  kind: "action";
  title: string;
  ownerPersona: string;
  status: "pending";
  skipReason: string | null;
}

export interface PopulateResult {
  step: "populate";
  section: string;
  proposedItems: ProposedItem[];
  nextStep: string;
}

export interface ReviewResult {
  step: "review";
  summary: {
    sprint: DraftResult["sprintDraft"];
    itemsToCreate: number;
    itemsSkipped: number;
    warnings: string[];
  };
  nextStep: "commit";
}

export interface CommitResult {
  step: "commit";
  sprintId: string;
  actionIds: string[];
  totalCreated: number;
}

export type BootstrapResult =
  | SurveyResult
  | DraftResult
  | PopulateResult
  | ReviewResult
  | CommitResult;

export interface BootstrapContext {
  store: DocumentStore;
  config: MarvinProjectConfig;
  manifest?: SourceManifestManager;
  /** Override AEM addendum inclusion. undefined = auto-detect from methodology. */
  includeAemAddendum?: boolean;
}

function getMethodology(config: MarvinProjectConfig): Methodology {
  return normalizeMethodology(config.methodology);
}

function getChecklist(methodology: Methodology, includeAemAddendum?: boolean): ChecklistItem[] {
  const registry = getConceptRegistry();
  // When overridden, force "aem" to include or "generic-agile" to exclude the addendum
  const effectiveMethodology =
    includeAemAddendum === true
      ? "aem"
      : includeAemAddendum === false
        ? "generic-agile"
        : methodology;
  const sprint0 = registry.explain("sprint-0", effectiveMethodology);
  return sprint0?.checklist ?? [];
}

function getSections(methodology: Methodology, includeAemAddendum?: boolean): string[] {
  return getChecklist(methodology, includeAemAddendum).map((c) => c.category);
}

function findExistingSprint0(store: DocumentStore): string | undefined {
  const sprints = store.list({ type: "sprint" });
  const match = sprints.find((s) => {
    const tags: string[] = s.frontmatter.tags ?? [];
    return (
      tags.includes("sprint-0") ||
      tags.includes("bootstrapping") ||
      s.frontmatter.title?.toLowerCase().includes("sprint 0")
    );
  });
  return match?.frontmatter.id;
}

export function survey(ctx: BootstrapContext): SurveyResult {
  const { store, config } = ctx;
  const counts = store.counts();
  const methodology = getMethodology(config);

  const alreadySatisfied: { item: string; evidence: string }[] = [];

  // Check Marvin init
  alreadySatisfied.push({
    item: "Marvin project initialized",
    evidence: ".marvin/config.yaml exists",
  });

  // Check if Jira is configured
  if (config.jira?.projectKey?.trim()) {
    alreadySatisfied.push({
      item: "Jira integration configured",
      evidence: `projectKey: ${config.jira.projectKey}`,
    });
  }

  return {
    step: "survey",
    projectState: {
      methodology,
      existingSprints: counts["sprint"] ?? 0,
      featuresCount: counts["feature"] ?? 0,
      actionsCount: counts["action"] ?? 0,
      decisionsCount: counts["decision"] ?? 0,
      integrationsConfigured: {
        jira: !!config.jira?.projectKey?.trim(),
        confluence: false, // No independent Confluence config field exists yet
      },
    },
    alreadySatisfied,
    nextStep: "draft",
  };
}

export function draft(ctx: BootstrapContext): DraftResult {
  const methodology = getMethodology(ctx.config);
  const sections = getSections(methodology, ctx.includeAemAddendum);

  const goalParts = sections.map((s) => s.replace(/-/g, " "));
  const goal = `Project bootstrapping — ${goalParts.join(", ")}`;

  return {
    step: "draft",
    sprintDraft: {
      idSuggested: `SP-${String(ctx.store.list({ type: "sprint" }).length + 1).padStart(3, "0")}`,
      title: "Sprint 0",
      goal,
      startDate: null,
      endDate: null,
      type: "sprint",
      tags: ["sprint-0", "bootstrapping"],
    },
    nextStep: "populate",
  };
}

export function populate(ctx: BootstrapContext, section?: BootstrapSection): PopulateResult {
  const methodology = getMethodology(ctx.config);
  const checklist = getChecklist(methodology, ctx.includeAemAddendum);
  const surveyResult = survey(ctx);
  const satisfiedItems = new Set(surveyResult.alreadySatisfied.map((s) => s.item));

  // Find the target section
  const targetSections = section ? checklist.filter((c) => c.category === section) : checklist;

  if (targetSections.length === 0) {
    return {
      step: "populate",
      section: section ?? "all",
      proposedItems: [],
      nextStep: "review",
    };
  }

  const currentSection = targetSections[0];
  const allSections = getSections(methodology, ctx.includeAemAddendum);
  const currentIdx = allSections.indexOf(currentSection.category);
  // Full populate (no section filter) returns all items at once → next is review
  const isFullPopulate = !section;
  const hasMore = !isFullPopulate && currentIdx < allSections.length - 1;

  const ownerMap: Record<string, string> = {
    "infrastructure-provisioning": "tl",
    "backlog-refinement": "po",
    "ceremony-scheduling": "dm",
    "integration-setup": "dm",
    "aem-addendum": "dm",
  };

  const proposedItems: ProposedItem[] = [];

  for (const sec of targetSections) {
    const owner = ownerMap[sec.category] ?? "dm";
    for (const item of sec.items) {
      const isAlreadySatisfied = satisfiedItems.has(item);
      proposedItems.push({
        kind: "action",
        title: `[Sprint 0] ${formatItemTitle(sec.category, item)}`,
        ownerPersona: owner,
        status: "pending",
        skipReason: isAlreadySatisfied ? "Already satisfied" : null,
      });
    }
  }

  const nextStep = hasMore ? `populate (next: ${allSections[currentIdx + 1]})` : "review";

  return {
    step: "populate",
    section: section ?? currentSection.category,
    proposedItems,
    nextStep,
  };
}

function formatItemTitle(category: string, item: string): string {
  const categoryLabels: Record<string, string> = {
    "infrastructure-provisioning": "Infrastructure",
    "backlog-refinement": "Backlog",
    "ceremony-scheduling": "Ceremonies",
    "integration-setup": "Integration",
    "aem-addendum": "AEM",
  };
  const label = categoryLabels[category] ?? category;
  return `${label}: ${item}`;
}

export function review(ctx: BootstrapContext): ReviewResult {
  const allItems = populate(ctx);
  const draftResult = draft(ctx);

  const toCreate = allItems.proposedItems.filter((i) => !i.skipReason);
  const skipped = allItems.proposedItems.filter((i) => i.skipReason);

  const warnings: string[] = [];
  if (!draftResult.sprintDraft.startDate) {
    warnings.push("startDate not yet set");
  }
  if (!draftResult.sprintDraft.endDate) {
    warnings.push("endDate not yet set");
  }

  // Check for existing Sprint 0
  const existingId = findExistingSprint0(ctx.store);
  if (existingId) {
    warnings.push(`Sprint 0 already exists: ${existingId}`);
  }

  // Check if we have enough items
  const populateAll = populate(ctx);
  if (populateAll.proposedItems.length === 0) {
    warnings.push("No checklist items found for this methodology");
  }

  return {
    step: "review",
    summary: {
      sprint: draftResult.sprintDraft,
      itemsToCreate: toCreate.length,
      itemsSkipped: skipped.length,
      warnings,
    },
    nextStep: "commit",
  };
}

export function commit(ctx: BootstrapContext): CommitResult {
  const { store } = ctx;

  // Check for existing Sprint 0
  const existingId = findExistingSprint0(store);
  if (existingId) {
    throw new ConfigError(
      `Sprint 0 already exists (${existingId}). Cannot create a duplicate. Use get_sprint("${existingId}") to view it.`,
    );
  }

  const draftResult = draft(ctx);

  // Create the sprint document
  const sprintDoc = store.create(
    "sprint",
    {
      title: draftResult.sprintDraft.title,
      status: "planned",
      goal: draftResult.sprintDraft.goal,
      tags: draftResult.sprintDraft.tags,
      linkedEpics: [],
    },
    `# ${draftResult.sprintDraft.title}\n\n${draftResult.sprintDraft.goal}\n\nThis sprint was generated by bootstrap_sprint_zero.`,
  );
  const sprintId = sprintDoc.frontmatter.id;

  // Create action items for each non-skipped checklist item
  const populateResult = populate(ctx);
  const actionIds: string[] = [];

  for (const item of populateResult.proposedItems) {
    if (item.skipReason) continue;

    const actionDoc = store.create(
      "action",
      {
        title: item.title,
        status: "open",
        owner: item.ownerPersona,
        tags: [`sprint:${sprintId}`, "sprint-0"],
      },
      `Bootstrapping action for Sprint 0.\n\nCategory: ${extractCategory(item.title)}\nOwner persona: ${item.ownerPersona}`,
    );
    actionIds.push(actionDoc.frontmatter.id);
  }

  return {
    step: "commit",
    sprintId,
    actionIds,
    totalCreated: actionIds.length + 1, // actions + sprint
  };
}

function extractCategory(title: string): string {
  const match = title.match(/\[Sprint 0\] (\w+):/);
  return match ? match[1] : "general";
}

export function runStep(
  ctx: BootstrapContext,
  step?: BootstrapStep,
  section?: BootstrapSection,
): BootstrapResult {
  const effectiveStep = step ?? "survey";

  switch (effectiveStep) {
    case "survey":
      return survey(ctx);
    case "draft":
      return draft(ctx);
    case "populate":
      return populate(ctx, section);
    case "review":
      return review(ctx);
    case "commit":
      return commit(ctx);
    default:
      throw new ConfigError(`Unknown step: ${effectiveStep}`);
  }
}
