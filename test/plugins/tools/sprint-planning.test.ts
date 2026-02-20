import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createSprintPlanningTools } from "../../../src/plugins/builtin/tools/sprint-planning.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("Sprint Planning Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let gather: (args: any) => Promise<any>;

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

    const tools = createSprintPlanningTools(store);
    gather = (tools[0] as any).handler;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns valid structure for empty project", async () => {
    const result = await gather({});
    const data = JSON.parse(result.content[0].text);

    expect(data.approvedFeatures).toEqual([]);
    expect(data.backlog).toEqual([]);
    expect(data.activeSprint).toBeNull();
    expect(data.velocityReference).toEqual([]);
    expect(data.blockers.openQuestions).toEqual([]);
    expect(data.blockers.openRiskAndBlockerContributions).toEqual([]);
    expect(data.summary.totalBacklogEpics).toBe(0);
    expect(data.summary.plannedSprintCount).toBe(0);
  });

  it("returns approved features sorted by priority", async () => {
    store.create("feature", { title: "Low Feature", status: "approved", priority: "low" });
    store.create("feature", { title: "Critical Feature", status: "approved", priority: "critical" });
    store.create("feature", { title: "High Feature", status: "approved", priority: "high" });
    store.create("feature", { title: "Draft Feature", status: "draft", priority: "critical" });

    const result = await gather({});
    const data = JSON.parse(result.content[0].text);

    expect(data.approvedFeatures).toHaveLength(3);
    expect(data.approvedFeatures[0].title).toBe("Critical Feature");
    expect(data.approvedFeatures[1].title).toBe("High Feature");
    expect(data.approvedFeatures[2].title).toBe("Low Feature");
  });

  it("backlog includes only unassigned non-done epics", async () => {
    store.create("feature", { title: "Feature A", status: "approved", priority: "high" });
    // E-001: unassigned, planned → in backlog
    store.create("epic", { title: "Epic 1", status: "planned", linkedFeature: "F-001" });
    // E-002: unassigned, done → NOT in backlog
    store.create("epic", { title: "Epic 2", status: "done", linkedFeature: "F-001" });
    // E-003: unassigned, in-progress → in backlog
    store.create("epic", { title: "Epic 3", status: "in-progress", linkedFeature: "F-001" });

    // SP-001 with E-003 linked → E-003 is assigned
    store.create("sprint", {
      title: "Sprint 1",
      status: "active",
      goal: "Goal",
      startDate: "2026-01-01",
      endDate: "2026-01-14",
      linkedEpics: ["E-003"],
    });

    const result = await gather({});
    const data = JSON.parse(result.content[0].text);

    expect(data.backlog).toHaveLength(1);
    expect(data.backlog[0].id).toBe("E-001");
  });

  it("focusFeature filters backlog to one feature", async () => {
    store.create("feature", { title: "Feature A", status: "approved", priority: "high" });
    store.create("feature", { title: "Feature B", status: "approved", priority: "medium" });
    store.create("epic", { title: "Epic A1", status: "planned", linkedFeature: "F-001" });
    store.create("epic", { title: "Epic B1", status: "planned", linkedFeature: "F-002" });

    const result = await gather({ focusFeature: "F-001" });
    const data = JSON.parse(result.content[0].text);

    expect(data.backlog).toHaveLength(1);
    expect(data.backlog[0].title).toBe("Epic A1");
    expect(data.backlog[0].featureTitle).toBe("Feature A");
  });

  it("populates active sprint with completion %", async () => {
    store.create("feature", { title: "Feature A", status: "approved" });
    store.create("epic", { title: "Epic 1", status: "in-progress", linkedFeature: "F-001" });
    store.create("sprint", {
      title: "Current Sprint",
      status: "active",
      goal: "Deliver stuff",
      startDate: "2026-02-01",
      endDate: "2026-02-14",
      linkedEpics: ["E-001"],
    });

    // Create work items tagged to this sprint
    store.create("action", { title: "Task A", status: "done", tags: ["sprint:SP-001"] });
    store.create("action", { title: "Task B", status: "open", tags: ["sprint:SP-001"] });
    store.create("action", { title: "Task C", status: "done", tags: ["sprint:SP-001"] });
    store.create("action", { title: "Task D", status: "open", tags: ["sprint:SP-001"] });

    const result = await gather({});
    const data = JSON.parse(result.content[0].text);

    expect(data.activeSprint).not.toBeNull();
    expect(data.activeSprint.id).toBe("SP-001");
    expect(data.activeSprint.goal).toBe("Deliver stuff");
    expect(data.activeSprint.linkedEpics).toHaveLength(1);
    expect(data.activeSprint.linkedEpics[0].status).toBe("in-progress");
    expect(data.activeSprint.workItems.total).toBe(4);
    expect(data.activeSprint.workItems.done).toBe(2);
    expect(data.activeSprint.workItems.completionPct).toBe(50);
  });

  it("velocity reference returns last 2 completed sprints by endDate", async () => {
    store.create("feature", { title: "Feature A", status: "approved" });
    store.create("epic", { title: "E1", status: "done", linkedFeature: "F-001", estimatedEffort: "3 days" });
    store.create("epic", { title: "E2", status: "done", linkedFeature: "F-001", estimatedEffort: "5 days" });
    store.create("epic", { title: "E3", status: "done", linkedFeature: "F-001" });

    // Oldest completed sprint
    store.create("sprint", {
      title: "Sprint 1",
      status: "completed",
      goal: "Goal 1",
      startDate: "2026-01-01",
      endDate: "2026-01-14",
      linkedEpics: ["E-001"],
    });
    // Most recent completed sprint
    store.create("sprint", {
      title: "Sprint 2",
      status: "completed",
      goal: "Goal 2",
      startDate: "2026-01-15",
      endDate: "2026-01-28",
      linkedEpics: ["E-002"],
    });
    // Third completed sprint (older, should be excluded)
    store.create("sprint", {
      title: "Sprint 0",
      status: "completed",
      goal: "Goal 0",
      startDate: "2025-12-01",
      endDate: "2025-12-14",
      linkedEpics: ["E-003"],
    });

    const result = await gather({});
    const data = JSON.parse(result.content[0].text);

    expect(data.velocityReference).toHaveLength(2);
    expect(data.velocityReference[0].id).toBe("SP-002"); // most recent first
    expect(data.velocityReference[0].efforts).toEqual(["5 days"]);
    expect(data.velocityReference[1].id).toBe("SP-001");
    expect(data.velocityReference[1].efforts).toEqual(["3 days"]);
  });

  it("gathers open blockers from questions and contributions", async () => {
    store.create("question", { title: "Open Q1", status: "open" });
    store.create("question", { title: "Answered Q", status: "answered" });
    store.create("contribution", {
      title: "Risk 1",
      status: "open",
      persona: "delivery-manager",
      contributionType: "risk-finding",
    });
    store.create("contribution", {
      title: "Blocker 1",
      status: "open",
      persona: "delivery-manager",
      contributionType: "blocker-report",
    });
    store.create("contribution", {
      title: "Closed risk",
      status: "closed",
      persona: "delivery-manager",
      contributionType: "risk-finding",
    });
    store.create("contribution", {
      title: "Status update",
      status: "open",
      persona: "delivery-manager",
      contributionType: "status-assessment",
    });

    const result = await gather({});
    const data = JSON.parse(result.content[0].text);

    expect(data.blockers.openQuestions).toHaveLength(1);
    expect(data.blockers.openQuestions[0].title).toBe("Open Q1");
    expect(data.blockers.openRiskAndBlockerContributions).toHaveLength(2);
    const titles = data.blockers.openRiskAndBlockerContributions.map((c: any) => c.title).sort();
    expect(titles).toEqual(["Blocker 1", "Risk 1"]);
  });

  it("flags approved features with no epics in summary", async () => {
    store.create("feature", { title: "Feature A", status: "approved", priority: "high" });
    store.create("feature", { title: "Feature B", status: "approved", priority: "low" });
    store.create("epic", { title: "Epic for A", status: "planned", linkedFeature: "F-001" });
    // F-002 has no epics

    const result = await gather({});
    const data = JSON.parse(result.content[0].text);

    expect(data.summary.approvedFeaturesWithNoEpics).toHaveLength(1);
    expect(data.summary.approvedFeaturesWithNoEpics[0].id).toBe("F-002");
    expect(data.summary.approvedFeaturesWithNoEpics[0].title).toBe("Feature B");
  });

  it("detects epics at risk from past targetDate and deferred feature", async () => {
    store.create("feature", { title: "Active Feature", status: "approved" });
    store.create("feature", { title: "Deferred Feature", status: "deferred" });

    // Past targetDate
    store.create("epic", {
      title: "Overdue Epic",
      status: "in-progress",
      linkedFeature: "F-001",
      targetDate: "2020-01-01",
    });
    // Linked to deferred feature
    store.create("epic", {
      title: "Deferred Epic",
      status: "planned",
      linkedFeature: "F-002",
    });
    // Done epic — should NOT be at risk
    store.create("epic", {
      title: "Done Epic",
      status: "done",
      linkedFeature: "F-002",
    });

    const result = await gather({});
    const data = JSON.parse(result.content[0].text);

    expect(data.summary.epicsAtRisk).toHaveLength(2);
    const riskIds = data.summary.epicsAtRisk.map((e: any) => e.id).sort();
    expect(riskIds).toEqual(["E-001", "E-002"]);

    const overdue = data.summary.epicsAtRisk.find((e: any) => e.id === "E-001");
    expect(overdue.reason).toBe("past-target-date");
    const deferred = data.summary.epicsAtRisk.find((e: any) => e.id === "E-002");
    expect(deferred.reason).toBe("deferred-feature");
  });

  it("passes sprintDurationDays through in response", async () => {
    const result = await gather({ sprintDurationDays: 14 });
    const data = JSON.parse(result.content[0].text);

    expect(data.sprintDurationDays).toBe(14);
  });
});
