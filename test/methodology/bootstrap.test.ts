import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../src/storage/store.js";
import type { MarvinProjectConfig } from "../../src/core/config.js";
import { COMMON_REGISTRATIONS } from "../../src/plugins/common.js";
import {
  survey,
  draft,
  populate,
  review,
  commit,
  runStep,
  type BootstrapContext,
} from "../../src/methodology/bootstrap.js";

function makeStore(marvinDir: string): DocumentStore {
  return new DocumentStore(marvinDir, COMMON_REGISTRATIONS);
}

function makeConfig(overrides?: Partial<MarvinProjectConfig>): MarvinProjectConfig {
  return {
    name: "test-project",
    methodology: "generic-agile",
    ...overrides,
  };
}

describe("Sprint 0 Bootstrap", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-bootstrap-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs", "decisions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "actions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "questions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "sprints"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "features"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "epics"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "tasks"), { recursive: true });
    store = makeStore(marvinDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedProject(): void {
    store.create("feature", { title: "Feature 1", status: "draft" }, "Feature 1 desc");
    store.create("feature", { title: "Feature 2", status: "approved" }, "Feature 2 desc");
    store.create("feature", { title: "Feature 3", status: "draft" }, "Feature 3 desc");
    store.create("action", { title: "Action 1", status: "open", owner: "dm" }, "Action 1 desc");
    store.create("decision", { title: "Decision 1", status: "proposed" }, "Decision 1 desc");
  }

  describe("survey", () => {
    it("returns project state counts", () => {
      seedProject();
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = survey(ctx);

      expect(result.step).toBe("survey");
      expect(result.projectState.methodology).toBe("generic-agile");
      expect(result.projectState.existingSprints).toBe(0);
      expect(result.projectState.featuresCount).toBe(3);
      expect(result.projectState.actionsCount).toBe(1);
      expect(result.projectState.decisionsCount).toBe(1);
      expect(result.nextStep).toBe("draft");
    });

    it("identifies Marvin init as already satisfied", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = survey(ctx);

      const initItem = result.alreadySatisfied.find((s) => s.item === "Marvin project initialized");
      expect(initItem).toBeDefined();
    });

    it("identifies Jira as already configured when present", () => {
      const config = makeConfig({
        jira: { projectKey: "TEST", host: "https://test.atlassian.net" },
      });
      const ctx: BootstrapContext = { store, config };
      const result = survey(ctx);

      const jiraItem = result.alreadySatisfied.find(
        (s) => s.item === "Jira integration configured",
      );
      expect(jiraItem).toBeDefined();
      expect(result.projectState.integrationsConfigured.jira).toBe(true);
    });

    it("does not flag Jira as satisfied when not configured", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = survey(ctx);

      const jiraItem = result.alreadySatisfied.find(
        (s) => s.item === "Jira integration configured",
      );
      expect(jiraItem).toBeUndefined();
      expect(result.projectState.integrationsConfigured.jira).toBe(false);
    });
  });

  describe("draft", () => {
    it("suggests Sprint 0 with SP-001 ID when no sprints exist", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = draft(ctx);

      expect(result.step).toBe("draft");
      expect(result.sprintDraft.idSuggested).toBe("SP-001");
      expect(result.sprintDraft.title).toBe("Sprint 0");
      expect(result.sprintDraft.tags).toContain("sprint-0");
      expect(result.sprintDraft.tags).toContain("bootstrapping");
      expect(result.sprintDraft.startDate).toBeNull();
      expect(result.sprintDraft.endDate).toBeNull();
      expect(result.nextStep).toBe("populate");
    });

    it("includes all checklist sections in goal (generic-agile)", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = draft(ctx);

      expect(result.sprintDraft.goal).toContain("infrastructure");
      expect(result.sprintDraft.goal).toContain("backlog");
      expect(result.sprintDraft.goal).toContain("ceremony");
      expect(result.sprintDraft.goal).toContain("integration");
    });

    it("includes AEM addendum in goal for AEM methodology", () => {
      const ctx: BootstrapContext = {
        store,
        config: makeConfig({ methodology: "sap-aem" }),
      };
      const result = draft(ctx);

      expect(result.sprintDraft.goal).toContain("aem");
    });
  });

  describe("populate", () => {
    it("returns proposed items for all sections", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = populate(ctx);

      expect(result.step).toBe("populate");
      expect(result.proposedItems.length).toBeGreaterThan(0);

      for (const item of result.proposedItems) {
        expect(item.kind).toBe("action");
        expect(item.title).toContain("[Sprint 0]");
        expect(item.status).toBe("pending");
      }
    });

    it("filters to a specific section", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = populate(ctx, "integration-setup");

      expect(result.section).toBe("integration-setup");
      for (const item of result.proposedItems) {
        expect(item.title).toContain("Integration");
      }
    });

    it("includes AEM addendum for AEM methodology", () => {
      const ctx: BootstrapContext = {
        store,
        config: makeConfig({ methodology: "sap-aem" }),
      };
      const result = populate(ctx);

      const aemItems = result.proposedItems.filter((i) => i.title.includes("AEM"));
      expect(aemItems.length).toBeGreaterThan(0);
    });

    it("excludes AEM addendum for generic-agile methodology", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = populate(ctx);

      const aemItems = result.proposedItems.filter((i) => i.title.includes("AEM"));
      expect(aemItems.length).toBe(0);
    });

    it("assigns correct owner personas per section", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = populate(ctx);

      const infraItems = result.proposedItems.filter((i) => i.title.includes("Infrastructure"));
      for (const item of infraItems) {
        expect(item.ownerPersona).toBe("tl");
      }

      const ceremonyItems = result.proposedItems.filter((i) => i.title.includes("Ceremonies"));
      for (const item of ceremonyItems) {
        expect(item.ownerPersona).toBe("dm");
      }
    });
  });

  describe("review", () => {
    it("summarizes items to create and skip", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = review(ctx);

      expect(result.step).toBe("review");
      expect(result.summary.itemsToCreate).toBeGreaterThan(0);
      expect(result.summary.sprint.title).toBe("Sprint 0");
      expect(result.nextStep).toBe("commit");
    });

    it("warns when startDate and endDate are not set", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = review(ctx);

      expect(result.summary.warnings).toContain("startDate not yet set");
      expect(result.summary.warnings).toContain("endDate not yet set");
    });

    it("warns when Sprint 0 already exists", () => {
      store.create(
        "sprint",
        { title: "Sprint 0", status: "planned", tags: ["sprint-0"] },
        "Existing sprint 0",
      );

      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = review(ctx);

      const existsWarning = result.summary.warnings.find((w) => w.includes("already exists"));
      expect(existsWarning).toBeDefined();
    });
  });

  describe("commit", () => {
    it("creates sprint and linked actions", () => {
      seedProject();
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = commit(ctx);

      expect(result.step).toBe("commit");
      expect(result.sprintId).toMatch(/^SP-\d{3}$/);
      expect(result.actionIds.length).toBeGreaterThan(0);
      expect(result.totalCreated).toBe(result.actionIds.length + 1);

      // Verify sprint was actually created
      const sprint = store.get(result.sprintId);
      expect(sprint).toBeDefined();
      expect(sprint!.frontmatter.title).toBe("Sprint 0");
      expect(sprint!.frontmatter.tags).toContain("sprint-0");

      // Verify actions were created with sprint tags
      for (const actionId of result.actionIds) {
        const action = store.get(actionId);
        expect(action).toBeDefined();
        expect(action!.frontmatter.tags).toContain(`sprint:${result.sprintId}`);
        expect(action!.frontmatter.tags).toContain("sprint-0");
      }
    });

    it("refuses to commit if Sprint 0 already exists", () => {
      store.create(
        "sprint",
        { title: "Sprint 0", status: "planned", tags: ["sprint-0"] },
        "Existing",
      );

      const ctx: BootstrapContext = { store, config: makeConfig() };
      expect(() => commit(ctx)).toThrow("already exists");
    });

    it("refuses to commit if sprint with bootstrapping tag exists", () => {
      store.create(
        "sprint",
        { title: "Bootstrap Sprint", status: "planned", tags: ["bootstrapping"] },
        "Existing",
      );

      const ctx: BootstrapContext = { store, config: makeConfig() };
      expect(() => commit(ctx)).toThrow("already exists");
    });

    it("creates AEM-specific actions for AEM methodology", () => {
      seedProject();
      const ctx: BootstrapContext = {
        store,
        config: makeConfig({ methodology: "sap-aem" }),
      };
      const result = commit(ctx);

      // Should have more actions due to AEM addendum
      const actions = result.actionIds.map((id) => store.get(id)!);
      const aemActions = actions.filter((a) => a.frontmatter.title.includes("AEM"));
      expect(aemActions.length).toBeGreaterThan(0);
    });

    it("does not create AEM actions for generic-agile", () => {
      seedProject();
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = commit(ctx);

      const actions = result.actionIds.map((id) => store.get(id)!);
      const aemActions = actions.filter((a) => a.frontmatter.title.includes("AEM"));
      expect(aemActions.length).toBe(0);
    });
  });

  describe("runStep", () => {
    it("defaults to survey when no step specified", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      const result = runStep(ctx);
      expect(result.step).toBe("survey");
    });

    it("runs the specified step", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };

      expect(runStep(ctx, "survey").step).toBe("survey");
      expect(runStep(ctx, "draft").step).toBe("draft");
      expect(runStep(ctx, "populate").step).toBe("populate");
      expect(runStep(ctx, "review").step).toBe("review");
    });

    it("throws for unknown step", () => {
      const ctx: BootstrapContext = { store, config: makeConfig() };
      expect(() => runStep(ctx, "unknown" as any)).toThrow("Unknown step");
    });
  });

  describe("AC2.1 — fresh project survey", () => {
    it("matches expected state for a project with features, actions, decisions, 0 sprints", () => {
      seedProject();
      const ctx: BootstrapContext = {
        store,
        config: makeConfig({ methodology: "sap-aem" }),
      };
      const result = survey(ctx);

      expect(result.projectState.existingSprints).toBe(0);
      expect(result.projectState.featuresCount).toBe(3);
      expect(result.projectState.actionsCount).toBe(1);
      expect(result.projectState.decisionsCount).toBe(1);
      expect(result.projectState.methodology).toBe("aem");
      expect(result.alreadySatisfied.some((s) => s.item === "Marvin project initialized")).toBe(
        true,
      );
    });
  });

  describe("AC2.2 — full workflow produces sprint + linked actions", () => {
    it("walking all steps produces SP sprint with N actions", () => {
      seedProject();
      const ctx: BootstrapContext = { store, config: makeConfig() };

      // Walk through steps
      const surveyResult = runStep(ctx, "survey");
      expect(surveyResult.step).toBe("survey");

      const draftResult = runStep(ctx, "draft");
      expect(draftResult.step).toBe("draft");

      const populateResult = runStep(ctx, "populate");
      expect(populateResult.step).toBe("populate");

      const reviewResult = runStep(ctx, "review");
      expect(reviewResult.step).toBe("review");

      const commitResult = runStep(ctx, "commit");
      expect(commitResult.step).toBe("commit");

      const cr = commitResult as any;
      expect(cr.sprintId).toBeDefined();
      expect(cr.actionIds.length).toBeGreaterThan(0);

      // Verify action count matches populate's non-skipped items
      const allItems = populate(ctx);
      const expectedCount = allItems.proposedItems.filter((i) => !i.skipReason).length;
      expect(cr.actionIds.length).toBe(expectedCount);
    });
  });

  describe("AC2.3 — duplicate Sprint 0 detection", () => {
    it("second commit after first returns error", () => {
      seedProject();
      const ctx: BootstrapContext = { store, config: makeConfig() };

      // First commit succeeds
      const first = commit(ctx);
      expect(first.sprintId).toBeDefined();

      // Second commit fails
      expect(() => commit(ctx)).toThrow("already exists");
    });
  });

  describe("AC2.5 — generic-agile excludes AEM addendum", () => {
    it("no AEM section in generic-agile populate", () => {
      const ctx: BootstrapContext = {
        store,
        config: makeConfig({ methodology: "generic-agile" }),
      };
      const result = populate(ctx);

      for (const item of result.proposedItems) {
        expect(item.title).not.toContain("AEM");
      }
    });
  });
});
