import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createReportTools } from "../../../src/plugins/builtin/tools/reports.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("Report Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let tools: Record<string, (args: any) => Promise<any>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "meetings", "reports", "features", "epics"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    // Populate test data
    store.create("action", { title: "Build API", status: "open", owner: "alice", priority: "high", tags: ["epic:backend", "risk"] });
    store.create("action", { title: "Write tests", status: "open", tags: ["epic:backend"] });
    store.create("action", { title: "Design UI", status: "done", owner: "bob", tags: ["epic:frontend"] });
    store.create("action", { title: "Deploy", status: "open", priority: "high", tags: ["blocked", "epic:infra"] });
    store.create("decision", { title: "Use REST", status: "open", tags: ["epic:backend"] });
    store.create("decision", { title: "Use React", status: "decided", tags: ["epic:frontend"] });
    store.create("question", { title: "Which DB?", status: "open", tags: ["risk"] });
    store.create("question", { title: "Auth method?", status: "answered" });

    const reportTools = createReportTools(store);
    tools = {};
    for (const t of reportTools) {
      tools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("generate_status_report", () => {
    it("should return correct counts and open items", async () => {
      const result = await tools.generate_status_report({});
      const report = JSON.parse(result.content[0].text);

      expect(report.totals.action).toBe(4);
      expect(report.totals.decision).toBe(2);
      expect(report.totals.question).toBe(2);
      expect(report.openActions).toHaveLength(3);
      expect(report.completedActions).toHaveLength(1);
      expect(report.completedActions[0].title).toBe("Design UI");
      expect(report.pendingDecisions).toHaveLength(1);
      expect(report.openQuestions).toHaveLength(1);
    });
  });

  describe("generate_risk_register", () => {
    it("should find risk-tagged items", async () => {
      const result = await tools.generate_risk_register({});
      const register = JSON.parse(result.content[0].text);

      expect(register.taggedRisks).toHaveLength(2); // Build API + Which DB?
      expect(register.highPriorityActions).toHaveLength(2); // Build API + Deploy
      expect(register.unresolvedQuestions).toHaveLength(1);
      expect(register.pendingDecisions).toHaveLength(1);
      expect(register.unownedActions).toHaveLength(2); // Write tests + Deploy
    });
  });

  describe("generate_gar_report", () => {
    it("should return area metrics", async () => {
      const result = await tools.generate_gar_report({});
      const { areas } = JSON.parse(result.content[0].text);

      expect(areas.scope.total).toBe(4);
      expect(areas.scope.open).toBe(3);
      expect(areas.scope.done).toBe(1);
      expect(areas.schedule.blocked).toBe(1);
      expect(areas.quality.openQuestions).toBe(1);
      expect(areas.quality.risks).toBe(2);
      expect(areas.resources.unowned).toBe(2);
    });
  });

  describe("generate_epic_progress", () => {
    it("should group legacy epic tags correctly", async () => {
      const result = await tools.generate_epic_progress({});
      const { legacyEpics } = JSON.parse(result.content[0].text);

      const epicNames = legacyEpics.map((e: any) => e.name).sort();
      expect(epicNames).toEqual(["backend", "frontend", "infra"]);

      const backend = legacyEpics.find((e: any) => e.name === "backend");
      expect(backend.total).toBe(3); // Build API + Write tests + Use REST
      expect(backend.byType.action).toBe(2);
      expect(backend.byType.decision).toBe(1);
    });

    it("should filter legacy epics by name", async () => {
      const result = await tools.generate_epic_progress({ epic: "frontend" });
      const { legacyEpics } = JSON.parse(result.content[0].text);

      expect(legacyEpics).toHaveLength(1);
      expect(legacyEpics[0].name).toBe("frontend");
      expect(legacyEpics[0].total).toBe(2); // Design UI + Use React
    });

    it("should group by E-xxx epic documents", async () => {
      // Create a feature and epic
      store.create("feature", { title: "Auth Feature", status: "approved" });
      store.create("epic", {
        title: "Auth Epic",
        status: "planned",
        linkedFeature: "F-001",
        tags: ["feature:F-001"],
      });
      // Tag an action with the epic ID
      store.create("action", { title: "Setup OAuth", status: "open", tags: ["epic:E-001"] });

      const result = await tools.generate_epic_progress({});
      const { epics } = JSON.parse(result.content[0].text);

      expect(epics).toHaveLength(1);
      expect(epics[0].id).toBe("E-001");
      expect(epics[0].title).toBe("Auth Epic");
      expect(epics[0].linkedFeature).toBe("F-001");
      expect(epics[0].workItems.total).toBe(1);
      expect(epics[0].workItems.items[0].title).toBe("Setup OAuth");
    });
  });

  describe("generate_feature_progress", () => {
    it("should report features with linked epics", async () => {
      store.create("feature", { title: "Auth Feature", status: "approved", priority: "high" });
      store.create("feature", { title: "Search Feature", status: "draft" });
      store.create("epic", {
        title: "Auth Epic 1",
        status: "planned",
        linkedFeature: "F-001",
        tags: ["feature:F-001"],
      });
      store.create("epic", {
        title: "Auth Epic 2",
        status: "in-progress",
        linkedFeature: "F-001",
        tags: ["feature:F-001"],
      });

      const result = await tools.generate_feature_progress({});
      const { features } = JSON.parse(result.content[0].text);

      expect(features).toHaveLength(2);

      const auth = features.find((f: any) => f.id === "F-001");
      expect(auth.title).toBe("Auth Feature");
      expect(auth.epics.total).toBe(2);
      expect(auth.epics.byStatus.planned).toBe(1);
      expect(auth.epics.byStatus["in-progress"]).toBe(1);

      const search = features.find((f: any) => f.id === "F-002");
      expect(search.epics.total).toBe(0);
    });

    it("should filter by specific feature", async () => {
      store.create("feature", { title: "Auth Feature", status: "approved" });
      store.create("feature", { title: "Search Feature", status: "draft" });

      const result = await tools.generate_feature_progress({ feature: "F-001" });
      const { features } = JSON.parse(result.content[0].text);

      expect(features).toHaveLength(1);
      expect(features[0].id).toBe("F-001");
    });
  });

  describe("save_report", () => {
    it("should create an R-001 document", async () => {
      const result = await tools.save_report({
        title: "Weekly Status",
        content: "# Status Report\n\nAll good.",
        reportType: "status",
        tags: ["sprint-1"],
      });
      expect(result.content[0].text).toContain("R-001");

      const doc = store.get("R-001");
      expect(doc).toBeDefined();
      expect(doc!.frontmatter.title).toBe("Weekly Status");
      expect(doc!.frontmatter.status).toBe("final");
      expect(doc!.frontmatter.tags).toContain("report-type:status");
      expect(doc!.frontmatter.tags).toContain("sprint-1");
      expect(doc!.content).toContain("# Status Report");
    });
  });
});
