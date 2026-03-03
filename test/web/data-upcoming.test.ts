import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../src/storage/store.js";
import { getUpcomingData } from "../../src/web/data.js";
import { COMMON_REGISTRATIONS } from "../../src/plugins/common.js";

describe("getUpcomingData", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-upcoming-test-"));
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
      "tasks",
    ]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // --- Due Soon tests ---

  describe("dueSoonActions", () => {
    it("should return empty arrays for empty store", () => {
      const data = getUpcomingData(store);
      expect(data.dueSoonActions).toHaveLength(0);
      expect(data.dueSoonSprintTasks).toHaveLength(0);
      expect(data.trending).toHaveLength(0);
    });

    it("should classify overdue actions", () => {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      store.create("action", {
        title: "Overdue action",
        status: "open",
        dueDate: yesterday,
      } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonActions).toHaveLength(1);
      expect(data.dueSoonActions[0].urgency).toBe("overdue");
    });

    it("should classify due-3d actions", () => {
      const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      store.create("action", {
        title: "Due soon action",
        status: "open",
        dueDate: inTwoDays,
      } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonActions).toHaveLength(1);
      expect(data.dueSoonActions[0].urgency).toBe("due-3d");
    });

    it("should classify due-7d actions", () => {
      const inFiveDays = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      store.create("action", {
        title: "Due in a week",
        status: "open",
        dueDate: inFiveDays,
      } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonActions).toHaveLength(1);
      expect(data.dueSoonActions[0].urgency).toBe("due-7d");
    });

    it("should classify upcoming actions (8-14 days)", () => {
      const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
      store.create("action", {
        title: "Upcoming action",
        status: "open",
        dueDate: inTenDays,
      } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonActions).toHaveLength(1);
      expect(data.dueSoonActions[0].urgency).toBe("upcoming");
    });

    it("should classify later actions (>14 days)", () => {
      const inThirtyDays = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      store.create("action", {
        title: "Later action",
        status: "open",
        dueDate: inThirtyDays,
      } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonActions).toHaveLength(1);
      expect(data.dueSoonActions[0].urgency).toBe("later");
    });

    it("should exclude done actions", () => {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      store.create("action", {
        title: "Done action",
        status: "done",
        dueDate: tomorrow,
      } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonActions).toHaveLength(0);
    });

    it("should sort by dueDate ascending", () => {
      const inFiveDays = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

      store.create("action", { title: "Later", status: "open", dueDate: inTenDays } as any);
      store.create("action", { title: "Soonest", status: "open", dueDate: inTwoDays } as any);
      store.create("action", { title: "Middle", status: "open", dueDate: inFiveDays } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonActions).toHaveLength(3);
      expect(data.dueSoonActions[0].title).toBe("Soonest");
      expect(data.dueSoonActions[1].title).toBe("Middle");
      expect(data.dueSoonActions[2].title).toBe("Later");
    });

    it("should find related tasks via sprint→epic→task chain", () => {
      // Create sprint → epic → task chain
      const sprint = store.create("sprint", {
        title: "Sprint 1",
        status: "active",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
        linkedEpics: ["E-001"],
      } as any);

      store.create("epic", {
        title: "Epic 1",
        status: "in-progress",
      } as any);

      store.create("task", {
        title: "Task 1",
        status: "open",
        tags: ["epic:E-001"],
      } as any);

      store.create("task", {
        title: "Task 2",
        status: "open",
        tags: ["epic:E-001"],
      } as any);

      // Create action tagged with the sprint
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      store.create("action", {
        title: "Action with tasks",
        status: "open",
        dueDate: tomorrow,
        tags: [`sprint:${sprint.frontmatter.id}`],
      } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonActions).toHaveLength(1);
      expect(data.dueSoonActions[0].relatedTaskCount).toBe(2);
    });

    it("should exclude actions without dueDate from dueSoonActions", () => {
      store.create("action", { title: "No due date", status: "open" });

      const data = getUpcomingData(store);
      expect(data.dueSoonActions).toHaveLength(0);
    });
  });

  describe("dueSoonSprintTasks", () => {
    it("should show tasks from sprints ending within 14 days", () => {
      const inSevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      store.create("sprint", {
        title: "Sprint 1",
        status: "active",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: inSevenDays,
        linkedEpics: ["E-001"],
      } as any);

      store.create("epic", {
        title: "Epic 1",
        status: "in-progress",
      } as any);

      store.create("task", {
        title: "Sprint task",
        status: "open",
        tags: ["epic:E-001"],
      } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonSprintTasks).toHaveLength(1);
      expect(data.dueSoonSprintTasks[0].sprintId).toBe("SP-001");
      expect(data.dueSoonSprintTasks[0].sprintEndDate).toBe(inSevenDays);
    });

    it("should exclude done tasks from sprint tasks", () => {
      const inSevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      store.create("sprint", {
        title: "Sprint 1",
        status: "active",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: inSevenDays,
        linkedEpics: ["E-001"],
      } as any);

      store.create("epic", { title: "Epic 1", status: "in-progress" } as any);
      store.create("task", { title: "Done task", status: "done", tags: ["epic:E-001"] } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonSprintTasks).toHaveLength(0);
    });

    it("should deduplicate tasks across sprints, picking nearest sprint end", () => {
      const inFiveDays = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

      store.create("sprint", {
        title: "Sprint Near",
        status: "active",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: inFiveDays,
        linkedEpics: ["E-001"],
      } as any);

      store.create("sprint", {
        title: "Sprint Far",
        status: "active",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: inTenDays,
        linkedEpics: ["E-001"],
      } as any);

      store.create("epic", { title: "Epic 1", status: "in-progress" } as any);
      store.create("task", { title: "Shared task", status: "open", tags: ["epic:E-001"] } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonSprintTasks).toHaveLength(1);
      expect(data.dueSoonSprintTasks[0].sprintEndDate).toBe(inFiveDays);
    });

    it("should not include tasks from sprints ending beyond 14 days", () => {
      const inThirtyDays = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      store.create("sprint", {
        title: "Far sprint",
        status: "active",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: inThirtyDays,
        linkedEpics: ["E-001"],
      } as any);

      store.create("epic", { title: "Epic 1", status: "in-progress" } as any);
      store.create("task", { title: "Future task", status: "open", tags: ["epic:E-001"] } as any);

      const data = getUpcomingData(store);
      expect(data.dueSoonSprintTasks).toHaveLength(0);
    });
  });

  // --- Trending tests ---

  describe("trending", () => {
    it("should return empty array for empty store", () => {
      const data = getUpcomingData(store);
      expect(data.trending).toHaveLength(0);
    });

    it("should score recency (recently updated scores higher)", () => {
      const now = new Date().toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

      store.create("action", {
        title: "Fresh action",
        status: "open",
        created: now,
        updated: now,
      });
      store.create("action", {
        title: "Old action",
        status: "open",
        created: thirtyDaysAgo,
        updated: thirtyDaysAgo,
      });

      const data = getUpcomingData(store);
      const fresh = data.trending.find((t) => t.title === "Fresh action");
      const old = data.trending.find((t) => t.title === "Old action");

      expect(fresh).toBeDefined();
      const freshRecency = fresh!.signals.find((s) => s.factor === "recency");
      expect(freshRecency).toBeDefined();
      expect(freshRecency!.points).toBe(20);

      // Old action: 30 days old → 0 recency points, may not appear if total score is 0
      if (old) {
        const oldRecency = old.signals.find((s) => s.factor === "recency");
        expect(oldRecency?.points ?? 0).toBeLessThan(freshRecency!.points);
      }
    });

    it("should score sprint proximity", () => {
      const today = new Date().toISOString().slice(0, 10);
      const inSevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

      store.create("sprint", {
        title: "Active Sprint",
        status: "active",
        startDate: today,
        endDate: inSevenDays,
        linkedEpics: ["E-001"],
      } as any);

      store.create("action", {
        title: "Sprint-linked action",
        status: "open",
        tags: ["sprint:SP-001"],
      } as any);

      const data = getUpcomingData(store);
      const item = data.trending.find((t) => t.title === "Sprint-linked action");
      expect(item).toBeDefined();
      const sprintSignal = item!.signals.find((s) => s.factor === "sprint proximity");
      expect(sprintSignal).toBeDefined();
      expect(sprintSignal!.points).toBe(25);
    });

    it("should score meeting mentions", () => {
      const now = new Date().toISOString();

      store.create("action", {
        title: "Mentioned action",
        status: "open",
        created: now,
        updated: now,
      });

      // Create a recent meeting that mentions the action
      store.create(
        "meeting",
        {
          title: "Team standup",
          status: "done",
          created: now,
          updated: now,
        },
        "Discussion about A-001 and progress.",
      );

      const data = getUpcomingData(store);
      const item = data.trending.find((t) => t.id === "A-001");
      expect(item).toBeDefined();
      const meetingSignal = item!.signals.find((s) => s.factor === "meeting mentions");
      expect(meetingSignal).toBeDefined();
      expect(meetingSignal!.points).toBe(5);
    });

    it("should score priority boost", () => {
      const now = new Date().toISOString();
      store.create("action", {
        title: "Critical action",
        status: "open",
        priority: "critical",
        created: now,
        updated: now,
      } as any);

      const data = getUpcomingData(store);
      const item = data.trending.find((t) => t.title === "Critical action");
      expect(item).toBeDefined();
      const prioritySignal = item!.signals.find((s) => s.factor === "priority");
      expect(prioritySignal).toBeDefined();
      expect(prioritySignal!.points).toBe(15);
    });

    it("should score aging boost for old open questions", () => {
      const twentyOneDaysAgo = new Date(Date.now() - 21 * 86_400_000).toISOString();
      store.create("question", {
        title: "Old question",
        status: "open",
        created: twentyOneDaysAgo,
        updated: new Date().toISOString(),
      });

      const data = getUpcomingData(store);
      const item = data.trending.find((t) => t.title === "Old question");
      expect(item).toBeDefined();
      const agingSignal = item!.signals.find((s) => s.factor === "aging");
      expect(agingSignal).toBeDefined();
      expect(agingSignal!.points).toBeGreaterThanOrEqual(5);
    });

    it("should score cross-references", () => {
      const now = new Date().toISOString();
      store.create("action", {
        title: "Referenced action",
        status: "open",
        created: now,
        updated: now,
      });

      // Create another doc whose content mentions A-001
      store.create(
        "decision",
        {
          title: "Decision about action",
          status: "open",
          created: now,
          updated: now,
        },
        "This relates to A-001 which we discussed earlier.",
      );

      const data = getUpcomingData(store);
      const item = data.trending.find((t) => t.id === "A-001");
      expect(item).toBeDefined();
      const crossRefSignal = item!.signals.find((s) => s.factor === "cross-references");
      expect(crossRefSignal).toBeDefined();
      expect(crossRefSignal!.points).toBe(5);
    });

    it("should sort by score descending", () => {
      const now = new Date().toISOString();
      store.create("action", {
        title: "Low priority",
        status: "open",
        created: now,
        updated: now,
      });
      store.create("action", {
        title: "High priority",
        status: "open",
        priority: "critical",
        created: now,
        updated: now,
      } as any);

      const data = getUpcomingData(store);
      expect(data.trending.length).toBeGreaterThanOrEqual(2);
      expect(data.trending[0].score).toBeGreaterThanOrEqual(data.trending[1].score);
      expect(data.trending[0].title).toBe("High priority");
    });

    it("should cap at 15 items", () => {
      const now = new Date().toISOString();
      for (let i = 0; i < 20; i++) {
        store.create("action", {
          title: `Action ${i}`,
          status: "open",
          priority: "high",
          created: now,
          updated: now,
        } as any);
      }

      const data = getUpcomingData(store);
      expect(data.trending.length).toBeLessThanOrEqual(15);
    });

    it("should exclude done items from trending", () => {
      const now = new Date().toISOString();
      store.create("action", {
        title: "Done action",
        status: "done",
        priority: "critical",
        created: now,
        updated: now,
      } as any);

      const data = getUpcomingData(store);
      const found = data.trending.find((t) => t.title === "Done action");
      expect(found).toBeUndefined();
    });
  });
});
