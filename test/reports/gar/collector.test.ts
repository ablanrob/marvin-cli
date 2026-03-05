import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { collectGarMetrics } from "../../../src/reports/gar/collector.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("collectGarMetrics", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "meetings", "reports", "features", "epics", "sprints", "tasks"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return empty at-risk items for empty store", () => {
    const metrics = collectGarMetrics(store);

    expect(metrics.scope.atRiskItems).toHaveLength(0);
    expect(metrics.scope.epicSummaries).toHaveLength(0);
    expect(metrics.schedule.blocked).toBe(0);
    expect(metrics.quality.riskCount).toBe(0);
  });

  it("should compute schedule blocked/overdue counts", () => {
    store.create("action", { title: "Build API", status: "open", owner: "alice", tags: ["risk"] });
    store.create("action", { title: "Write tests", status: "open" });
    store.create("action", { title: "Design UI", status: "done", owner: "bob" });
    store.create("action", { title: "Deploy", status: "open", tags: ["blocked"] });
    store.create("question", { title: "Which DB?", status: "open", tags: ["risk"] });
    store.create("question", { title: "Auth method?", status: "answered" });

    const metrics = collectGarMetrics(store);

    expect(metrics.schedule.blocked).toBe(1);
    expect(metrics.schedule.overdue).toBe(0);
    expect(metrics.quality.riskCount).toBe(2);
    expect(metrics.quality.openQuestions).toBe(1);
  });

  it("should include schedule items with ids and titles", () => {
    store.create("action", { title: "Deploy", status: "open", tags: ["blocked"] });
    store.create("action", { title: "Write tests", status: "open" });
    store.create("question", { title: "Which DB?", status: "open", tags: ["risk"] });

    const metrics = collectGarMetrics(store);

    expect(metrics.schedule.items).toHaveLength(1);
    expect(metrics.schedule.items[0].id).toBe("A-001");

    expect(metrics.quality.items).toHaveLength(1);
    expect(metrics.quality.items[0].id).toBe("Q-001");
  });

  it("should deduplicate items tagged with both blocked and overdue", () => {
    store.create("action", { title: "Deploy", status: "open", tags: ["blocked", "overdue"] });

    const metrics = collectGarMetrics(store);

    expect(metrics.schedule.blocked).toBe(1);
    expect(metrics.schedule.overdue).toBe(1);
    expect(metrics.schedule.items).toHaveLength(1);
  });

  it("should count open action with past dueDate as overdue with daysOverdue", () => {
    store.create("action", { title: "Overdue task", status: "open", dueDate: "2020-01-01" } as any);

    const metrics = collectGarMetrics(store);

    expect(metrics.schedule.overdue).toBe(1);
    expect(metrics.schedule.items).toHaveLength(1);
    expect(metrics.schedule.items[0].title).toBe("Overdue task");
    expect(metrics.schedule.items[0].daysOverdue).toBeGreaterThan(0);
  });

  it("should NOT count done action with past dueDate as overdue", () => {
    store.create("action", { title: "Completed task", status: "done", dueDate: "2020-01-01" } as any);

    const metrics = collectGarMetrics(store);

    expect(metrics.schedule.overdue).toBe(0);
    expect(metrics.schedule.items).toHaveLength(0);
  });

  it("should deduplicate action with both overdue tag and past dueDate", () => {
    store.create("action", { title: "Double overdue", status: "open", tags: ["overdue"], dueDate: "2020-01-01" } as any);

    const metrics = collectGarMetrics(store);

    expect(metrics.schedule.overdue).toBe(1);
    expect(metrics.schedule.items).toHaveLength(1);
  });

  it("should count tag-overdue question and date-overdue action separately", () => {
    store.create("question", { title: "Overdue Q", status: "open", tags: ["overdue"] });
    store.create("action", { title: "Late action", status: "open", dueDate: "2020-01-01" } as any);

    const metrics = collectGarMetrics(store);

    expect(metrics.schedule.overdue).toBe(2);
    expect(metrics.schedule.items).toHaveLength(2);
  });

  it("should exclude risk items with status 'done' from quality risks", () => {
    store.create("action", { title: "Open risk", status: "open", tags: ["risk"] });
    store.create("action", { title: "Done risk", status: "done", tags: ["risk"] });

    const metrics = collectGarMetrics(store);

    expect(metrics.quality.riskCount).toBe(1);
    expect(metrics.quality.items).toHaveLength(1);
    expect(metrics.quality.items[0].title).toBe("Open risk");
  });

  it("should exclude risk items with status 'closed' from quality risks", () => {
    store.create("question", { title: "Open risk Q", status: "open", tags: ["risk"] });
    store.create("question", { title: "Closed risk Q", status: "closed", tags: ["risk"] });

    const metrics = collectGarMetrics(store);

    expect(metrics.quality.riskCount).toBe(1);
    expect(metrics.quality.items[0].title).toBe("Open risk Q");
  });

  it("should count badly overdue items (> 7 days)", () => {
    store.create("action", { title: "Very late", status: "open", dueDate: "2020-01-01" } as any);

    const metrics = collectGarMetrics(store);

    expect(metrics.schedule.badlyOverdueCount).toBe(1);
  });

  it("should compute weighted risk score by priority", () => {
    store.create("action", { title: "Critical risk", status: "open", tags: ["risk"], priority: "critical" } as any);
    store.create("action", { title: "Low risk", status: "open", tags: ["risk"], priority: "low" } as any);

    const metrics = collectGarMetrics(store);

    // critical=4, low=1
    expect(metrics.quality.riskScore).toBe(5);
    expect(metrics.quality.riskCount).toBe(2);
  });

  it("should track totalOpenItems for relative threshold", () => {
    store.create("action", { title: "A1", status: "open" });
    store.create("action", { title: "A2", status: "open" });
    store.create("action", { title: "A3", status: "done" });

    const metrics = collectGarMetrics(store);

    // 2 open actions + potentially other open docs
    expect(metrics.quality.totalOpenItems).toBeGreaterThanOrEqual(2);
  });
});
