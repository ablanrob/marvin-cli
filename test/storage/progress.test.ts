import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../src/storage/store.js";
import { COMMON_REGISTRATIONS } from "../../src/plugins/common.js";
import {
  getEffectiveProgress,
  propagateProgressFromTask,
  propagateProgressToAction,
  calculateSprintCompletionPct,
} from "../../src/storage/progress.js";
import type { DocumentFrontmatter } from "../../src/storage/types.js";

function makeFrontmatter(overrides: Partial<DocumentFrontmatter> = {}): DocumentFrontmatter {
  return {
    id: "X-001",
    title: "Test",
    type: "action",
    status: "open",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    ...overrides,
  };
}

describe("getEffectiveProgress", () => {
  it("returns 100 for done statuses", () => {
    for (const status of ["done", "closed", "resolved", "cancelled"]) {
      expect(getEffectiveProgress(makeFrontmatter({ status }))).toBe(100);
    }
  });

  it("returns explicit progress when set", () => {
    expect(getEffectiveProgress(makeFrontmatter({ status: "in-progress", progress: 55 } as any))).toBe(55);
  });

  it("clamps progress to 0-100", () => {
    expect(getEffectiveProgress(makeFrontmatter({ progress: -10 } as any))).toBe(0);
    expect(getEffectiveProgress(makeFrontmatter({ progress: 150 } as any))).toBe(100);
  });

  it("rounds fractional progress", () => {
    expect(getEffectiveProgress(makeFrontmatter({ progress: 33.7 } as any))).toBe(34);
  });

  it("returns 0 when no progress field and not done", () => {
    expect(getEffectiveProgress(makeFrontmatter({ status: "in-progress" }))).toBe(0);
  });

  it("done status trumps explicit progress", () => {
    expect(getEffectiveProgress(makeFrontmatter({ status: "done", progress: 50 } as any))).toBe(100);
  });
});

describe("propagateProgressFromTask", () => {
  let tmpDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-progress-"));
    const marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "contributions", "tasks"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("auto-calculates from child contributions", () => {
    store.create("task", { title: "Task 1", status: "in-progress" } as any);
    store.create("contribution", { title: "C1", status: "done", aboutArtifact: "T-001" } as any);
    store.create("contribution", { title: "C2", status: "open", aboutArtifact: "T-001" } as any);

    const updated = propagateProgressFromTask(store, "T-001");
    expect(updated).toContain("T-001");

    const task = store.get("T-001")!;
    // done=100, open=0 → avg 50
    expect(task.frontmatter.progress).toBe(50);
  });

  it("sets progress=100 for done tasks", () => {
    store.create("task", { title: "Task 1", status: "done" } as any);
    const updated = propagateProgressFromTask(store, "T-001");
    expect(updated).toContain("T-001");

    const task = store.get("T-001")!;
    expect(task.frontmatter.progress).toBe(100);
  });

  it("auto-calculates when no progressOverride flag (default behavior)", () => {
    store.create("task", { title: "Task 1", status: "in-progress", progress: 70 } as any);
    store.create("contribution", { title: "C1", status: "done", aboutArtifact: "T-001" } as any);

    const updated = propagateProgressFromTask(store, "T-001");
    expect(updated).toContain("T-001");

    const task = store.get("T-001")!;
    // No progressOverride → child contrib (done=100) overrides explicit 70
    expect(task.frontmatter.progress).toBe(100);
  });

  it("respects progressOverride flag — skips auto-calc from children", () => {
    store.create("task", { title: "Task 1", status: "in-progress", progress: 70, progressOverride: true } as any);
    store.create("contribution", { title: "C1", status: "done", aboutArtifact: "T-001" } as any);

    const updated = propagateProgressFromTask(store, "T-001");
    // Task itself should NOT be updated (override preserved)
    expect(updated).not.toContain("T-001");

    const task = store.get("T-001")!;
    // Explicit 70 is preserved despite child being done (100)
    expect(task.frontmatter.progress).toBe(70);
  });

  it("still propagates upward when task has progressOverride", () => {
    store.create("action", { title: "Action 1", status: "in-progress" } as any);
    store.create("task", { title: "Task 1", status: "in-progress", aboutArtifact: "A-001", progress: 70, progressOverride: true } as any);
    store.create("contribution", { title: "C1", status: "done", aboutArtifact: "T-001" } as any);

    const updated = propagateProgressFromTask(store, "T-001");
    // Task is NOT updated, but parent action IS
    expect(updated).not.toContain("T-001");
    expect(updated).toContain("A-001");

    const action = store.get("A-001")!;
    // Action auto-calculates from task's effective progress (70)
    expect(action.frontmatter.progress).toBe(70);
  });

  it("propagates to parent action", () => {
    store.create("action", { title: "Action 1", status: "in-progress" } as any);
    store.create("task", { title: "Task 1", status: "in-progress", aboutArtifact: "A-001" } as any);
    store.create("contribution", { title: "C1", status: "done", aboutArtifact: "T-001" } as any);

    const updated = propagateProgressFromTask(store, "T-001");
    expect(updated).toContain("T-001");
    expect(updated).toContain("A-001");

    const action = store.get("A-001")!;
    // Task progress = 100 (1 done contribution), action has 1 task → 100
    expect(action.frontmatter.progress).toBe(100);
  });

  it("returns empty for missing doc", () => {
    expect(propagateProgressFromTask(store, "T-999")).toEqual([]);
  });
});

describe("propagateProgressToAction", () => {
  let tmpDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-progress-"));
    const marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "contributions", "tasks"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("calculates from child tasks only", () => {
    store.create("action", { title: "Action 1", status: "in-progress" } as any);
    store.create("task", { title: "T1", status: "done", aboutArtifact: "A-001" } as any);
    store.create("task", { title: "T2", status: "in-progress", aboutArtifact: "A-001", progress: 50 } as any);

    const updated = propagateProgressToAction(store, "A-001");
    expect(updated).toContain("A-001");

    const action = store.get("A-001")!;
    // done=100, 50 → avg 75
    expect(action.frontmatter.progress).toBe(75);
  });

  it("calculates from direct contributions only", () => {
    store.create("action", { title: "Action 1", status: "in-progress" } as any);
    store.create("contribution", { title: "C1", status: "done", aboutArtifact: "A-001" } as any);
    store.create("contribution", { title: "C2", status: "done", aboutArtifact: "A-001" } as any);

    const updated = propagateProgressToAction(store, "A-001");
    expect(updated).toContain("A-001");

    const action = store.get("A-001")!;
    // both done → 100
    expect(action.frontmatter.progress).toBe(100);
  });

  it("applies 80/20 weighting when both sources exist", () => {
    store.create("action", { title: "Action 1", status: "in-progress" } as any);
    store.create("task", { title: "T1", status: "in-progress", aboutArtifact: "A-001", progress: 50 } as any);
    store.create("contribution", { title: "C1", status: "done", aboutArtifact: "A-001" } as any);

    const updated = propagateProgressToAction(store, "A-001");
    expect(updated).toContain("A-001");

    const action = store.get("A-001")!;
    // task=50, contrib=100 → 50*0.8 + 100*0.2 = 40 + 20 = 60
    expect(action.frontmatter.progress).toBe(60);
  });

  it("does not update when no children", () => {
    store.create("action", { title: "Action 1", status: "in-progress" } as any);
    const updated = propagateProgressToAction(store, "A-001");
    expect(updated).toEqual([]);
  });

  it("sets progress=100 for done actions", () => {
    store.create("action", { title: "Action 1", status: "done" } as any);
    const updated = propagateProgressToAction(store, "A-001");
    expect(updated).toContain("A-001");

    const action = store.get("A-001")!;
    expect(action.frontmatter.progress).toBe(100);
  });

  it("returns empty for missing doc", () => {
    expect(propagateProgressToAction(store, "A-999")).toEqual([]);
  });

  it("respects progressOverride flag — skips auto-calc from children", () => {
    store.create("action", { title: "Action 1", status: "in-progress", progress: 40, progressOverride: true } as any);
    store.create("task", { title: "T1", status: "done", aboutArtifact: "A-001" } as any);

    const updated = propagateProgressToAction(store, "A-001");
    // Action should NOT be updated (override preserved)
    expect(updated).toEqual([]);

    const action = store.get("A-001")!;
    // Explicit 40 is preserved despite child task being done (100)
    expect(action.frontmatter.progress).toBe(40);
  });

  it("still auto-calculates without progressOverride flag", () => {
    store.create("action", { title: "Action 1", status: "in-progress", progress: 40 } as any);
    store.create("task", { title: "T1", status: "done", aboutArtifact: "A-001" } as any);

    const updated = propagateProgressToAction(store, "A-001");
    expect(updated).toContain("A-001");

    const action = store.get("A-001")!;
    // No override → auto-calc from child task (done=100) overwrites 40
    expect(action.frontmatter.progress).toBe(100);
  });
});

describe("calculateSprintCompletionPct", () => {
  it("averages progress across items", () => {
    const items = [
      { frontmatter: makeFrontmatter({ status: "done" }) },
      { frontmatter: makeFrontmatter({ status: "in-progress", progress: 50 } as any) },
      { frontmatter: makeFrontmatter({ status: "open" }) },
    ];
    // 100 + 50 + 0 = 150 / 3 = 50
    expect(calculateSprintCompletionPct(items)).toBe(50);
  });

  it("returns 0 for empty array", () => {
    expect(calculateSprintCompletionPct([])).toBe(0);
  });

  it("returns 100 when all done", () => {
    const items = [
      { frontmatter: makeFrontmatter({ status: "done" }) },
      { frontmatter: makeFrontmatter({ status: "resolved" }) },
    ];
    expect(calculateSprintCompletionPct(items)).toBe(100);
  });
});
