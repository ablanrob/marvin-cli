import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createSprintTools } from "../../../src/plugins/builtin/tools/sprints.js";
import { createEpicTools } from "../../../src/plugins/builtin/tools/epics.js";
import { createFeatureTools } from "../../../src/plugins/builtin/tools/features.js";
import { createReportTools } from "../../../src/plugins/builtin/tools/reports.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("Sprint Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let sprintTools: Record<string, (args: any) => Promise<any>>;
  let epicTools: Record<string, (args: any) => Promise<any>>;
  let featureTools: Record<string, (args: any) => Promise<any>>;
  let reportTools: Record<string, (args: any) => Promise<any>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of [
      "decisions", "actions", "questions", "meetings", "reports",
      "features", "epics", "contributions", "sprints",
    ]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    sprintTools = {};
    for (const t of createSprintTools(store)) {
      sprintTools[t.name] = (t as any).handler;
    }
    epicTools = {};
    for (const t of createEpicTools(store)) {
      epicTools[t.name] = (t as any).handler;
    }
    featureTools = {};
    for (const t of createFeatureTools(store)) {
      featureTools[t.name] = (t as any).handler;
    }
    reportTools = {};
    for (const t of createReportTools(store)) {
      reportTools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("create_sprint", () => {
    it("should create a sprint with defaults", async () => {
      const result = await sprintTools.create_sprint({
        title: "Sprint 1",
        content: "First iteration.",
        goal: "Deliver auth module",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
      });
      expect(result.content[0].text).toContain("SP-001");
      expect(result.content[0].text).toContain("Sprint 1");

      const doc = store.get("SP-001");
      expect(doc).toBeDefined();
      expect(doc!.frontmatter.type).toBe("sprint");
      expect(doc!.frontmatter.status).toBe("planned");
      expect(doc!.frontmatter.goal).toBe("Deliver auth module");
      expect(doc!.frontmatter.startDate).toBe("2026-03-01");
      expect(doc!.frontmatter.endDate).toBe("2026-03-14");
      expect(doc!.frontmatter.linkedEpics).toEqual([]);
    });

    it("should create a past sprint with completed status", async () => {
      const result = await sprintTools.create_sprint({
        title: "Sprint 0",
        content: "Historical sprint.",
        goal: "Initial setup",
        startDate: "2026-01-01",
        endDate: "2026-01-14",
        status: "completed",
      });
      expect(result.content[0].text).toContain("SP-001");

      const doc = store.get("SP-001");
      expect(doc!.frontmatter.status).toBe("completed");
    });

    it("should auto-tag linked epics with sprint:SP-xxx", async () => {
      // Create a feature and epic first
      await featureTools.create_feature({
        title: "Feature A",
        content: "A",
        status: "approved",
      });
      await epicTools.create_epic({
        title: "Epic 1",
        content: "E1",
        linkedFeature: "F-001",
      });

      await sprintTools.create_sprint({
        title: "Sprint 1",
        content: "First sprint.",
        goal: "Deliver E-001",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        linkedEpics: ["E-001"],
      });

      const epic = store.get("E-001");
      expect(epic!.frontmatter.tags).toContain("sprint:SP-001");
    });

    it("should warn but not block when linked epic not found", async () => {
      const result = await sprintTools.create_sprint({
        title: "Sprint 1",
        content: "Sprint with missing epic.",
        goal: "Try linking",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        linkedEpics: ["E-999"],
      });
      expect(result.content[0].text).toContain("SP-001");
      expect(result.content[0].text).toContain("E-999 not found");

      const doc = store.get("SP-001");
      expect(doc).toBeDefined();
      expect(doc!.frontmatter.linkedEpics).toEqual(["E-999"]);
    });

    it("should include additional tags", async () => {
      await sprintTools.create_sprint({
        title: "Sprint 1",
        content: "Tagged sprint.",
        goal: "Test tags",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        tags: ["team-alpha"],
      });

      const doc = store.get("SP-001");
      expect(doc!.frontmatter.tags).toContain("team-alpha");
    });
  });

  describe("list_sprints", () => {
    beforeEach(async () => {
      await sprintTools.create_sprint({
        title: "Sprint 1",
        content: "S1",
        goal: "Goal 1",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
      });
      await sprintTools.create_sprint({
        title: "Sprint 2",
        content: "S2",
        goal: "Goal 2",
        startDate: "2026-03-15",
        endDate: "2026-03-28",
        status: "active",
      });
      await sprintTools.create_sprint({
        title: "Sprint 0",
        content: "S0",
        goal: "Goal 0",
        startDate: "2026-02-01",
        endDate: "2026-02-14",
        status: "completed",
      });
    });

    it("should list all sprints", async () => {
      const result = await sprintTools.list_sprints({});
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(3);
    });

    it("should filter by status", async () => {
      const result = await sprintTools.list_sprints({ status: "planned" });
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(1);
      expect(list[0].title).toBe("Sprint 1");
    });

    it("should filter active sprints", async () => {
      const result = await sprintTools.list_sprints({ status: "active" });
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(1);
      expect(list[0].title).toBe("Sprint 2");
    });
  });

  describe("get_sprint", () => {
    it("should return sprint details", async () => {
      await sprintTools.create_sprint({
        title: "Sprint 1",
        content: "Sprint details here.",
        goal: "Deliver auth",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
      });

      const result = await sprintTools.get_sprint({ id: "SP-001" });
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBe("Sprint 1");
      expect(data.goal).toBe("Deliver auth");
      expect(data.content).toBe("Sprint details here.");
    });

    it("should return error for non-existent sprint", async () => {
      const result = await sprintTools.get_sprint({ id: "SP-999" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("update_sprint", () => {
    it("should update sprint status and dates", async () => {
      await sprintTools.create_sprint({
        title: "Sprint 1",
        content: "S1",
        goal: "Goal",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
      });

      const result = await sprintTools.update_sprint({
        id: "SP-001",
        status: "active",
        endDate: "2026-03-21",
      });
      expect(result.content[0].text).toContain("Updated sprint SP-001");

      const doc = store.get("SP-001");
      expect(doc!.frontmatter.status).toBe("active");
      expect(doc!.frontmatter.endDate).toBe("2026-03-21");
    });

    it("should return error for non-existent sprint", async () => {
      const result = await sprintTools.update_sprint({
        id: "SP-999",
        status: "active",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("should re-tag epics when linkedEpics changes", async () => {
      // Setup: feature + 2 epics
      await featureTools.create_feature({
        title: "Feature A",
        content: "A",
        status: "approved",
      });
      await epicTools.create_epic({
        title: "Epic 1",
        content: "E1",
        linkedFeature: "F-001",
      });
      await epicTools.create_epic({
        title: "Epic 2",
        content: "E2",
        linkedFeature: "F-001",
      });

      // Create sprint linked to E-001
      await sprintTools.create_sprint({
        title: "Sprint 1",
        content: "S1",
        goal: "Goal",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        linkedEpics: ["E-001"],
      });

      expect(store.get("E-001")!.frontmatter.tags).toContain("sprint:SP-001");
      expect(store.get("E-002")!.frontmatter.tags).not.toContain("sprint:SP-001");

      // Update: remove E-001, add E-002
      await sprintTools.update_sprint({
        id: "SP-001",
        linkedEpics: ["E-002"],
      });

      expect(store.get("E-001")!.frontmatter.tags).not.toContain("sprint:SP-001");
      expect(store.get("E-002")!.frontmatter.tags).toContain("sprint:SP-001");

      const sprint = store.get("SP-001");
      expect(sprint!.frontmatter.linkedEpics).toEqual(["E-002"]);
    });
  });

  describe("generate_sprint_progress", () => {
    it("should generate correct rollup data", async () => {
      // Setup: feature, epic, sprint, and tagged work items
      await featureTools.create_feature({
        title: "Feature A",
        content: "A",
        status: "approved",
      });
      await epicTools.create_epic({
        title: "Epic 1",
        content: "E1",
        linkedFeature: "F-001",
        status: "in-progress",
      });

      await sprintTools.create_sprint({
        title: "Sprint 1",
        content: "S1",
        goal: "Deliver auth",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        status: "active",
        linkedEpics: ["E-001"],
      });

      // Create tagged work items
      store.create("action", {
        title: "Implement login",
        status: "done",
        tags: ["sprint:SP-001"],
      }, "Login action");
      store.create("action", {
        title: "Implement logout",
        status: "open",
        tags: ["sprint:SP-001"],
      }, "Logout action");
      store.create("question", {
        title: "Which auth library?",
        status: "open",
        tags: ["sprint:SP-001"],
      }, "Question about auth");

      const result = await reportTools.generate_sprint_progress({ sprint: "SP-001" });
      const data = JSON.parse(result.content[0].text);

      expect(data.sprints).toHaveLength(1);
      const sprint = data.sprints[0];
      expect(sprint.id).toBe("SP-001");
      expect(sprint.status).toBe("active");
      expect(sprint.goal).toBe("Deliver auth");
      expect(sprint.linkedEpics).toHaveLength(1);
      expect(sprint.linkedEpics[0].id).toBe("E-001");
      expect(sprint.linkedEpics[0].status).toBe("in-progress");
      expect(sprint.workItems.total).toBe(3);
      expect(sprint.workItems.done).toBe(1);
      expect(sprint.workItems.completionPct).toBe(33);
      expect(sprint.workItems.byStatus.done).toBe(1);
      expect(sprint.workItems.byStatus.open).toBe(2);
    });

    it("should return all sprints when no filter provided", async () => {
      await sprintTools.create_sprint({
        title: "Sprint 1",
        content: "S1",
        goal: "Goal 1",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
      });
      await sprintTools.create_sprint({
        title: "Sprint 2",
        content: "S2",
        goal: "Goal 2",
        startDate: "2026-03-15",
        endDate: "2026-03-28",
      });

      const result = await reportTools.generate_sprint_progress({});
      const data = JSON.parse(result.content[0].text);
      expect(data.sprints).toHaveLength(2);
    });

    it("should show linked epic as not found when epic missing", async () => {
      await sprintTools.create_sprint({
        title: "Sprint 1",
        content: "S1",
        goal: "Goal",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        linkedEpics: ["E-999"],
      });

      const result = await reportTools.generate_sprint_progress({ sprint: "SP-001" });
      const data = JSON.parse(result.content[0].text);
      expect(data.sprints[0].linkedEpics[0].title).toBe("(not found)");
      expect(data.sprints[0].linkedEpics[0].status).toBe("unknown");
    });
  });
});
