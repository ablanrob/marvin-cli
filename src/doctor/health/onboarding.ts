import type { HealthContext } from "./types.js";

export interface OnboardingStep {
  order: number;
  title: string;
  description: string;
  tool?: string;
  done: boolean;
}

export interface OnboardingGuide {
  projectName: string;
  methodology: string;
  phase?: string;
  status: "empty" | "getting-started" | "in-progress";
  steps: OnboardingStep[];
  summary: string;
}

/** Inspect project state and produce a tailored onboarding guide. */
export function buildOnboardingGuide(ctx: HealthContext): OnboardingGuide {
  const counts = ctx.store.counts();
  const totalArtifacts = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const methodology = ctx.config.methodology ?? "generic-agile";
  const isAem = methodology === "sap-aem";
  const phase = ctx.config.aem?.currentPhase;

  const hasSources = (ctx.manifest?.list()?.length ?? 0) > 0;
  const pendingSources = ctx.manifest?.list("pending")?.length ?? 0;
  const hasActions = (counts["action"] ?? 0) > 0;
  const hasEpics = (counts["epic"] ?? 0) > 0;
  const hasSprints = (counts["sprint"] ?? 0) > 0;
  const hasFeatures = (counts["feature"] ?? 0) > 0;
  const hasUseCases = (counts["use-case"] ?? 0) > 0;
  const hasJira = !!ctx.config.jira?.projectKey?.trim();

  const steps: OnboardingStep[] = [];
  let order = 1;

  // Step 1: Ingest source documents
  if (hasSources || pendingSources > 0) {
    steps.push({
      order: order++,
      title: "Ingest source documents",
      description:
        pendingSources > 0
          ? `${pendingSources} source file(s) in .marvin/sources/ are ready for processing. Set the PO persona and ingest them to extract requirements, use cases, and initial artifacts.`
          : "All source files have been processed.",
      tool: "set_persona",
      done: pendingSources === 0 && hasSources,
    });
  }

  // Step 2: Define scope (methodology-specific)
  if (isAem) {
    steps.push({
      order: order++,
      title: "Define extension use cases",
      description:
        "As PO, create use cases (UC-xxx) that describe business scenarios requiring SAP BTP extension. Classify each by extension type (in-app, side-by-side, hybrid) and priority.",
      tool: "create_use_case",
      done: hasUseCases,
    });
  } else {
    steps.push({
      order: order++,
      title: "Define features",
      description:
        "As PO, create features (F-xxx) that describe the product capabilities to build. Set priorities and acceptance criteria.",
      tool: "create_feature",
      done: hasFeatures,
    });
  }

  // Step 3: Capture decisions and actions
  steps.push({
    order: order++,
    title: "Capture key decisions and actions",
    description:
      "Record important decisions (D-xxx) with rationale and create action items (A-xxx) for work that needs to happen. Set owners and due dates on actions.",
    tool: "create_decision",
    done: (counts["decision"] ?? 0) > 0 && hasActions,
  });

  // Step 4: Break down into epics
  steps.push({
    order: order++,
    title: "Break work into epics",
    description: isAem
      ? "As TL, create tech assessments for approved use cases, then break extension designs into implementation epics (E-xxx)."
      : "As TL, break approved features into implementation epics (E-xxx) with effort estimates.",
    tool: "create_epic",
    done: hasEpics,
  });

  // Step 5: Set up Sprint 0
  steps.push({
    order: order++,
    title: "Set up Sprint 0",
    description:
      "As DM, create a Sprint 0 to organize bootstrapping work: infrastructure provisioning, CI/CD setup, backlog refinement, and ceremony scheduling. Sprint 0 is not a regular sprint — it's a variable-duration bootstrapping phase that ensures the team is ready for Sprint 1.",
    tool: "create_sprint",
    done: hasSprints,
  });

  // Step 6: Configure Jira integration
  steps.push({
    order: order++,
    title: "Configure Jira integration",
    description:
      "Add jira.projectKey to .marvin/config.yaml to enable bidirectional sync. This allows pushing artifacts to Jira and pulling sprint progress back.",
    done: hasJira,
  });

  // Step 7: Run health check
  steps.push({
    order: order,
    title: "Run a health check",
    description:
      "Use check_project_health to verify governance setup is complete. It will flag any missing configuration or unfinished setup steps.",
    tool: "check_project_health",
    done: false, // Always suggest running this
  });

  const doneCount = steps.filter((s) => s.done).length;
  const status: OnboardingGuide["status"] =
    totalArtifacts === 0
      ? "empty"
      : doneCount < steps.length - 1
        ? "getting-started"
        : "in-progress";

  const pending = steps.filter((s) => !s.done);
  const summary =
    pending.length === 0
      ? "Project setup is complete. All onboarding steps are done."
      : `${doneCount} of ${steps.length} steps complete. Next: ${pending[0].title}.`;

  return {
    projectName: ctx.config.name,
    methodology,
    phase,
    status,
    steps,
    summary,
  };
}
