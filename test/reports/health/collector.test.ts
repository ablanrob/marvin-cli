import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { collectHealthMetrics, daysBetween } from "../../../src/reports/health/collector.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("daysBetween", () => {
  it("should return 0 for same date", () => {
    expect(daysBetween("2025-01-01", "2025-01-01")).toBe(0);
  });

  it("should return correct days between dates", () => {
    expect(daysBetween("2025-01-01", "2025-01-15")).toBe(14);
  });

  it("should handle ISO timestamps", () => {
    expect(daysBetween("2025-01-01T00:00:00.000Z", "2025-01-08T00:00:00.000Z")).toBe(7);
  });
});

describe("collectHealthMetrics", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-health-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of [
      "decisions",
      "actions",
      "questions",
      "meetings",
      "reports",
      "features",
      "epics",
      "sprints",
    ]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // --- Completeness tests ---

  it("should return empty metrics for empty store", () => {
    const metrics = collectHealthMetrics(store);

    expect(metrics.completeness.action.total).toBe(0);
    expect(metrics.completeness.action.complete).toBe(0);
    expect(metrics.completeness.action.gaps).toHaveLength(0);
    expect(metrics.completeness.decision.total).toBe(0);
    expect(metrics.completeness.question.total).toBe(0);
  });

  it("should detect missing fields on open actions", () => {
    store.create("action", { title: "No owner", status: "open" });
    store.create("action", {
      title: "Missing priority",
      status: "open",
      owner: "alice",
      dueDate: "2025-06-01",
    } as any);

    const metrics = collectHealthMetrics(store);
    const actionMetrics = metrics.completeness.action;

    expect(actionMetrics.total).toBe(2);
    expect(actionMetrics.complete).toBe(0);
    expect(actionMetrics.gaps).toHaveLength(2);

    const gap1 = actionMetrics.gaps.find((g) => g.id === "A-001")!;
    expect(gap1.missingFields).toContain("owner");
    expect(gap1.missingFields).toContain("priority");
    expect(gap1.missingFields).toContain("dueDate");
    expect(gap1.missingFields).toContain("content");

    const gap2 = actionMetrics.gaps.find((g) => g.id === "A-002")!;
    expect(gap2.missingFields).toContain("priority");
    expect(gap2.missingFields).toContain("content");
    expect(gap2.missingFields).not.toContain("owner");
    expect(gap2.missingFields).not.toContain("dueDate");
  });

  it("should skip done items from completeness checks", () => {
    store.create("action", { title: "Done item", status: "done" });
    store.create("action", { title: "Closed item", status: "closed" });

    const metrics = collectHealthMetrics(store);

    expect(metrics.completeness.action.total).toBe(0);
    expect(metrics.completeness.action.gaps).toHaveLength(0);
  });

  it("should report complete items with all required fields", () => {
    store.create(
      "action",
      {
        title: "Complete action",
        status: "open",
        owner: "alice",
        priority: "high",
        dueDate: "2025-06-01",
      } as any,
      "Some meaningful content",
    );

    const metrics = collectHealthMetrics(store);

    expect(metrics.completeness.action.total).toBe(1);
    expect(metrics.completeness.action.complete).toBe(1);
    expect(metrics.completeness.action.gaps).toHaveLength(0);
  });

  it("should check multiple artifact types", () => {
    store.create("decision", { title: "Missing owner decision", status: "open" });
    store.create("question", { title: "Missing owner question", status: "open" });
    store.create(
      "decision",
      { title: "Good decision", status: "proposed", owner: "bob" },
      "Decision rationale here",
    );

    const metrics = collectHealthMetrics(store);

    expect(metrics.completeness.decision.total).toBe(2);
    expect(metrics.completeness.decision.complete).toBe(1);
    expect(metrics.completeness.decision.gaps).toHaveLength(1);

    expect(metrics.completeness.question.total).toBe(1);
    expect(metrics.completeness.question.complete).toBe(0);
    expect(metrics.completeness.question.gaps).toHaveLength(1);
  });

  it("should check feature fields", () => {
    store.create("feature", { title: "Draft feature", status: "draft" });

    const metrics = collectHealthMetrics(store);

    expect(metrics.completeness.feature.total).toBe(1);
    expect(metrics.completeness.feature.gaps[0].missingFields).toContain("owner");
    expect(metrics.completeness.feature.gaps[0].missingFields).toContain("priority");
    expect(metrics.completeness.feature.gaps[0].missingFields).toContain("content");
  });

  it("should check epic fields", () => {
    store.create("epic", { title: "Epic one", status: "planned" });

    const metrics = collectHealthMetrics(store);

    expect(metrics.completeness.epic.total).toBe(1);
    const gap = metrics.completeness.epic.gaps[0];
    expect(gap.missingFields).toContain("owner");
    expect(gap.missingFields).toContain("targetDate");
    expect(gap.missingFields).toContain("estimatedEffort");
    expect(gap.missingFields).toContain("content");
  });

  it("should check sprint fields including linkedEpics", () => {
    store.create("sprint", { title: "Sprint 1", status: "planned" } as any);

    const metrics = collectHealthMetrics(store);

    expect(metrics.completeness.sprint.total).toBe(1);
    const gap = metrics.completeness.sprint.gaps[0];
    expect(gap.missingFields).toContain("goal");
    expect(gap.missingFields).toContain("startDate");
    expect(gap.missingFields).toContain("endDate");
    expect(gap.missingFields).toContain("linkedEpics");
  });

  // --- Process tests ---

  it("should detect stale items (not updated in >= 14 days)", () => {
    const oldDate = new Date(Date.now() - 15 * 86_400_000).toISOString();
    store.create("action", {
      title: "Old action",
      status: "open",
      created: oldDate,
      updated: oldDate,
    });

    const metrics = collectHealthMetrics(store);

    expect(metrics.process.stale).toHaveLength(1);
    expect(metrics.process.stale[0].id).toBe("A-001");
    expect(metrics.process.stale[0].days).toBeGreaterThanOrEqual(14);
  });

  it("should not flag recently updated items as stale", () => {
    const recentDate = new Date().toISOString();
    store.create("action", {
      title: "Fresh action",
      status: "open",
      created: recentDate,
      updated: recentDate,
    });

    const metrics = collectHealthMetrics(store);

    expect(metrics.process.stale).toHaveLength(0);
  });

  it("should detect aging actions (open > 30 days)", () => {
    const oldDate = new Date(Date.now() - 35 * 86_400_000).toISOString();
    store.create("action", {
      title: "Ancient action",
      status: "open",
      created: oldDate,
      updated: new Date().toISOString(),
    });

    const metrics = collectHealthMetrics(store);

    expect(metrics.process.agingActions).toHaveLength(1);
    expect(metrics.process.agingActions[0].days).toBeGreaterThanOrEqual(30);
  });

  it("should not count done actions as aging", () => {
    const oldDate = new Date(Date.now() - 35 * 86_400_000).toISOString();
    store.create("action", {
      title: "Old but done",
      status: "done",
      created: oldDate,
      updated: new Date().toISOString(),
    });

    const metrics = collectHealthMetrics(store);

    expect(metrics.process.agingActions).toHaveLength(0);
  });

  it("should compute decision velocity", () => {
    const created = "2025-01-01T00:00:00.000Z";
    const updated = "2025-01-08T00:00:00.000Z";
    store.create("decision", {
      title: "Resolved fast",
      status: "resolved",
      created,
      updated,
    });
    store.create("decision", {
      title: "Resolved slow",
      status: "accepted",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-22T00:00:00.000Z",
    });

    const metrics = collectHealthMetrics(store);

    // (7 + 21) / 2 = 14
    expect(metrics.process.decisionVelocity.count).toBe(2);
    expect(metrics.process.decisionVelocity.avgDays).toBe(14);
  });

  it("should compute question resolution time", () => {
    store.create("question", {
      title: "Answered quick",
      status: "answered",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-04T00:00:00.000Z",
    });

    const metrics = collectHealthMetrics(store);

    expect(metrics.process.questionResolution.count).toBe(1);
    expect(metrics.process.questionResolution.avgDays).toBe(3);
  });

  it("should return 0 avg days when no resolved decisions exist", () => {
    store.create("decision", { title: "Still open", status: "open" });

    const metrics = collectHealthMetrics(store);

    expect(metrics.process.decisionVelocity.count).toBe(0);
    expect(metrics.process.decisionVelocity.avgDays).toBe(0);
  });

  it("should return 0 avg days when no answered questions exist", () => {
    store.create("question", { title: "Still open", status: "open" });

    const metrics = collectHealthMetrics(store);

    expect(metrics.process.questionResolution.count).toBe(0);
    expect(metrics.process.questionResolution.avgDays).toBe(0);
  });

  it("should not flag closed items as stale", () => {
    const oldDate = new Date(Date.now() - 30 * 86_400_000).toISOString();
    store.create("action", {
      title: "Done action",
      status: "done",
      created: oldDate,
      updated: oldDate,
    });
    store.create("decision", {
      title: "Resolved decision",
      status: "resolved",
      created: oldDate,
      updated: oldDate,
    });

    const metrics = collectHealthMetrics(store);

    expect(metrics.process.stale).toHaveLength(0);
  });
});
