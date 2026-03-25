import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import {
  mapJiraStatusForAction,
  mapJiraStatusForTask,
  computeSubtaskProgress,
  fetchJiraStatus,
  syncJiraProgress,
  isInActiveSprint,
  normalizeStatusMap,
  type ResolvedStatusMap,
} from "../../../src/skills/builtin/jira/sync.js";
import type { JiraClient, JiraIssue } from "../../../src/skills/builtin/jira/client.js";

describe("Status mappers (defaults)", () => {
  describe("mapJiraStatusForAction", () => {
    it.each([
      ["Done", "done"],
      ["Closed", "done"],
      ["Resolved", "done"],
      ["In Progress", "in-progress"],
      ["In Review", "in-progress"],
      ["Reviewing", "in-progress"],
      ["Testing", "in-progress"],
      ["BLOCKED", "blocked"],
      ["Obsolete", "done"],
      ["OBSOLETE", "done"],
      ["Wont Do", "done"],
      ["WONT DO", "done"],
      ["To Do", "open"],
      ["Open", "open"],
      ["Backlog", "open"],
    ])("maps '%s' → '%s'", (input, expected) => {
      expect(mapJiraStatusForAction(input, {})).toBe(expected);
    });
  });

  describe("mapJiraStatusForTask", () => {
    it.each([
      ["Done", "done"],
      ["Closed", "done"],
      ["Resolved", "done"],
      ["In Review", "review"],
      ["Code Review", "review"],
      ["Reviewing", "review"],
      ["REVIEWING", "review"],
      ["Testing", "review"],
      ["TESTING", "review"],
      ["BLOCKED", "blocked"],
      ["Obsolete", "done"],
      ["OBSOLETE", "done"],
      ["Wont Do", "done"],
      ["WONT DO", "done"],
      ["In Progress", "in-progress"],
      ["Ready", "ready"],
      ["Selected for Development", "ready"],
      ["To Do", "backlog"],
      ["Open", "backlog"],
      ["Backlog", "backlog"],
    ])("maps '%s' → '%s'", (input, expected) => {
      expect(mapJiraStatusForTask(input, {})).toBe(expected);
    });
  });
});

describe("Config-driven status mapping (legacy format)", () => {
  it("should use custom action map when provided", () => {
    const resolved: ResolvedStatusMap = {
      legacy: { action: { done: ["Finito", "Kaput"], "in-progress": ["Working"] } },
    };
    expect(mapJiraStatusForAction("Finito", resolved)).toBe("done");
    expect(mapJiraStatusForAction("Working", resolved)).toBe("in-progress");
    expect(mapJiraStatusForAction("Unknown", resolved)).toBe("open"); // fallback
  });

  it("should use custom task map when provided", () => {
    const resolved: ResolvedStatusMap = {
      legacy: { task: { done: ["Complete"], review: ["QA"] } },
    };
    expect(mapJiraStatusForTask("Complete", resolved)).toBe("done");
    expect(mapJiraStatusForTask("QA", resolved)).toBe("review");
    expect(mapJiraStatusForTask("Unknown", resolved)).toBe("backlog"); // fallback
  });

  it("should be case-insensitive with custom maps", () => {
    const resolved: ResolvedStatusMap = {
      legacy: { action: { done: ["FINISHED"] } },
    };
    expect(mapJiraStatusForAction("finished", resolved)).toBe("done");
    expect(mapJiraStatusForAction("FINISHED", resolved)).toBe("done");
    expect(mapJiraStatusForAction("Finished", resolved)).toBe("done");
  });

  it("should use defaults when no custom map provided", () => {
    expect(mapJiraStatusForAction("Done", {})).toBe("done");
    expect(mapJiraStatusForTask("In Review", {})).toBe("review");
  });
});

describe("Config-driven status mapping (flat/spec format)", () => {
  it("should use flat Jira→Marvin mapping", () => {
    const resolved: ResolvedStatusMap = {
      flat: {
        "In Progress": "in-progress",
        "Done": "done",
        "To Do": "backlog",
      },
    };
    expect(mapJiraStatusForTask("In Progress", resolved)).toBe("in-progress");
    expect(mapJiraStatusForTask("Done", resolved)).toBe("done");
    expect(mapJiraStatusForTask("To Do", resolved)).toBe("backlog");
    expect(mapJiraStatusForTask("Unknown", resolved)).toBe("backlog"); // fallback
  });

  it("should be case-insensitive with flat format", () => {
    const resolved: ResolvedStatusMap = {
      flat: { "DONE": "done" },
    };
    expect(mapJiraStatusForAction("done", resolved)).toBe("done");
    expect(mapJiraStatusForAction("Done", resolved)).toBe("done");
  });

  it("should apply same mapping to both actions and tasks", () => {
    const resolved: ResolvedStatusMap = {
      flat: { "In Progress": "in-progress" },
    };
    expect(mapJiraStatusForAction("In Progress", resolved)).toBe("in-progress");
    expect(mapJiraStatusForTask("In Progress", resolved)).toBe("in-progress");
  });
});

describe("normalizeStatusMap", () => {
  it("should return empty for undefined", () => {
    expect(normalizeStatusMap(undefined)).toEqual({});
  });

  it("should detect flat format (Jira→Marvin strings)", () => {
    const raw = {
      "In Progress": "in-progress",
      "Done": "done",
      "To Do": { default: "backlog", inSprint: "ready" },
    };
    const result = normalizeStatusMap(raw);
    expect(result.flat).toEqual(raw);
    expect(result.legacy).toBeUndefined();
  });

  it("should detect legacy format (action/task with string arrays)", () => {
    const raw = {
      action: { done: ["Done", "Closed"], open: ["To Do"] },
      task: { backlog: ["To Do", "Open"] },
    };
    const result = normalizeStatusMap(raw);
    expect(result.legacy).toEqual(raw);
    expect(result.flat).toBeUndefined();
  });

  it("should detect legacy format with only task key", () => {
    const raw = { task: { done: ["Done"] } };
    const result = normalizeStatusMap(raw);
    expect(result.legacy).toEqual(raw);
  });

  it("should treat as flat format when keys are not action/task", () => {
    const raw = { "Done": "done", "Open": "backlog" };
    const result = normalizeStatusMap(raw);
    expect(result.flat).toEqual(raw);
  });
});

describe("Context-aware status mapping (conditional entries)", () => {
  it("should resolve default when not in sprint", () => {
    const resolved: ResolvedStatusMap = {
      flat: {
        "To Do": { default: "backlog", inSprint: "ready" },
        "Ready": "ready",
      },
    };
    expect(mapJiraStatusForTask("To Do", resolved, false)).toBe("backlog");
    expect(mapJiraStatusForTask("Ready", resolved, false)).toBe("ready");
  });

  it("should resolve inSprint when in sprint", () => {
    const resolved: ResolvedStatusMap = {
      flat: {
        "To Do": { default: "backlog", inSprint: "ready" },
        "Open": "backlog",
        "Ready": "ready",
      },
    };
    // "To Do" normally maps to backlog, but in sprint maps to ready
    expect(mapJiraStatusForTask("To Do", resolved, true)).toBe("ready");
    // "Open" still maps to backlog (simple mapping, no override)
    expect(mapJiraStatusForTask("Open", resolved, true)).toBe("backlog");
    // "Ready" still maps to ready
    expect(mapJiraStatusForTask("Ready", resolved, true)).toBe("ready");
  });

  it("should work with mixed simple and conditional entries", () => {
    const resolved: ResolvedStatusMap = {
      flat: {
        "Done": "done",
        "Closed": "done",
        "To Do": { default: "backlog", inSprint: "ready" },
        "New": "backlog",
        "Ready": "ready",
      },
    };
    // Simple entries always work
    expect(mapJiraStatusForTask("Done", resolved, false)).toBe("done");
    expect(mapJiraStatusForTask("Done", resolved, true)).toBe("done");
    // Conditional default
    expect(mapJiraStatusForTask("To Do", resolved, false)).toBe("backlog");
    // Conditional inSprint
    expect(mapJiraStatusForTask("To Do", resolved, true)).toBe("ready");
    // "New" always maps to backlog
    expect(mapJiraStatusForTask("New", resolved, true)).toBe("backlog");
  });

  it("should fall back to default when inSprint key is missing", () => {
    const resolved: ResolvedStatusMap = {
      flat: {
        "To Do": { default: "backlog" },
      },
    };
    // No inSprint key → falls back to default even when in sprint
    expect(mapJiraStatusForTask("To Do", resolved, true)).toBe("backlog");
  });

  it("should be case-insensitive with conditional entries", () => {
    const resolved: ResolvedStatusMap = {
      flat: {
        "TO DO": { default: "backlog", inSprint: "ready" },
      },
    };
    expect(mapJiraStatusForTask("to do", resolved, true)).toBe("ready");
    expect(mapJiraStatusForTask("TO DO", resolved, true)).toBe("ready");
  });

  it("should work for action maps too", () => {
    const resolved: ResolvedStatusMap = {
      flat: {
        "To Do": { default: "open", inSprint: "in-progress" },
      },
    };
    expect(mapJiraStatusForAction("To Do", resolved, false)).toBe("open");
    expect(mapJiraStatusForAction("To Do", resolved, true)).toBe("in-progress");
  });

  it("should use fallback when status not in any map", () => {
    const resolved: ResolvedStatusMap = {
      flat: { "Done": "done" },
    };
    expect(mapJiraStatusForTask("Unknown", resolved, false)).toBe("backlog");
    expect(mapJiraStatusForTask("Unknown", resolved, true)).toBe("backlog");
    expect(mapJiraStatusForAction("Unknown", resolved, false)).toBe("open");
  });
});

describe("isInActiveSprint", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  const SPRINT_REG = { type: "sprint", dirName: "sprints", idPrefix: "SP" };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-sprint-ctx-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs"), { recursive: true });
    store = new DocumentStore(marvinDir, [SPRINT_REG]);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return false for undefined tags", () => {
    expect(isInActiveSprint(store, undefined)).toBe(false);
  });

  it("should return false for empty tags", () => {
    expect(isInActiveSprint(store, [])).toBe(false);
  });

  it("should return false for tags without sprint prefix", () => {
    expect(isInActiveSprint(store, ["focus:Auth", "jira:PROJ-1"])).toBe(false);
  });

  it("should return false when sprint doc does not exist", () => {
    expect(isInActiveSprint(store, ["sprint:SP-999"])).toBe(false);
  });

  it("should return true for active sprint", () => {
    store.create("sprint", { title: "Sprint 1", status: "active" }, "");
    expect(isInActiveSprint(store, ["sprint:SP-001"])).toBe(true);
  });

  it("should return true for completed sprint", () => {
    store.create("sprint", { title: "Sprint 1", status: "completed" }, "");
    expect(isInActiveSprint(store, ["sprint:SP-001"])).toBe(true);
  });

  it("should return false for planned sprint", () => {
    store.create("sprint", { title: "Sprint 1", status: "planned" }, "");
    expect(isInActiveSprint(store, ["sprint:SP-001"])).toBe(false);
  });

  it("should return false for cancelled sprint", () => {
    store.create("sprint", { title: "Sprint 1", status: "cancelled" }, "");
    expect(isInActiveSprint(store, ["sprint:SP-001"])).toBe(false);
  });

  it("should return true if any sprint is active (multiple sprint tags)", () => {
    store.create("sprint", { title: "Sprint 1", status: "cancelled" }, "");
    store.create("sprint", { title: "Sprint 2", status: "active" }, "");
    expect(isInActiveSprint(store, ["sprint:SP-001", "sprint:SP-002"])).toBe(true);
  });
});

describe("fetchJiraStatus with context-aware mapping", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let mockClient: JiraClient;

  const TASK_REG = { type: "task", dirName: "tasks", idPrefix: "T" };
  const SPRINT_REG = { type: "sprint", dirName: "sprints", idPrefix: "SP" };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-ctx-fetch-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs"), { recursive: true });
    store = new DocumentStore(marvinDir, [TASK_REG, SPRINT_REG]);

    mockClient = {
      getIssueWithLinks: vi.fn(),
    } as unknown as JiraClient;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeIssue(overrides: Partial<JiraIssue["fields"]> = {}): JiraIssue {
    return {
      key: "PROJ-1",
      id: "10001",
      self: "https://test.atlassian.net/rest/api/2/issue/10001",
      fields: {
        summary: "Test issue",
        description: null,
        status: { name: "To Do" },
        issuetype: { name: "Task" },
        priority: { name: "Medium" },
        assignee: null,
        labels: [],
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
        ...overrides,
      },
    };
  }

  it("should map 'To Do' to ready when task is in active sprint with conditional map", async () => {
    // Create active sprint
    store.create("sprint", { title: "Sprint 9", status: "active" }, "");

    // Create task with sprint tag
    store.create("task", {
      title: "Sprint Task",
      status: "ready",
      jiraKey: "PROJ-1",
      tags: ["sprint:SP-001"],
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({ status: { name: "To Do" } }),
    );

    const resolved: ResolvedStatusMap = {
      flat: {
        "To Do": { default: "backlog", inSprint: "ready" },
        "Open": "backlog",
        "Ready": "ready",
        "Done": "done",
      },
    };

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net", undefined, resolved);
    expect(result.artifacts).toHaveLength(1);
    // "To Do" should map to "ready" because task is in active sprint
    expect(result.artifacts[0].proposedMarvinStatus).toBe("ready");
    expect(result.artifacts[0].statusChanged).toBe(false); // already ready
  });

  it("should map 'To Do' to backlog when task is NOT in sprint with conditional map", async () => {
    // Create task without sprint tag
    store.create("task", {
      title: "Backlog Task",
      status: "backlog",
      jiraKey: "PROJ-1",
      tags: [],
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({ status: { name: "To Do" } }),
    );

    const resolved: ResolvedStatusMap = {
      flat: {
        "To Do": { default: "backlog", inSprint: "ready" },
        "Open": "backlog",
        "Ready": "ready",
        "Done": "done",
      },
    };

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net", undefined, resolved);
    expect(result.artifacts).toHaveLength(1);
    // "To Do" should map to "backlog" because task is not in sprint
    expect(result.artifacts[0].proposedMarvinStatus).toBe("backlog");
    expect(result.artifacts[0].statusChanged).toBe(false); // already backlog
  });

  it("should map 'To Do' to backlog when sprint is cancelled", async () => {
    // Create cancelled sprint
    store.create("sprint", { title: "Sprint 9", status: "cancelled" }, "");

    // Create task with sprint tag for cancelled sprint
    store.create("task", {
      title: "Cancelled Sprint Task",
      status: "backlog",
      jiraKey: "PROJ-1",
      tags: ["sprint:SP-001"],
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({ status: { name: "To Do" } }),
    );

    const resolved: ResolvedStatusMap = {
      flat: {
        "To Do": { default: "backlog", inSprint: "ready" },
        "Open": "backlog",
        "Ready": "ready",
      },
    };

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net", undefined, resolved);
    expect(result.artifacts[0].proposedMarvinStatus).toBe("backlog");
  });
});

describe("computeSubtaskProgress", () => {
  it("should return 0 for empty subtasks", () => {
    expect(computeSubtaskProgress([])).toBe(0);
  });

  it("should return 100 when all subtasks done", () => {
    const subtasks = [
      { fields: { status: { name: "Done" } } },
      { fields: { status: { name: "Closed" } } },
    ];
    expect(computeSubtaskProgress(subtasks)).toBe(100);
  });

  it("should return 0 when no subtasks done", () => {
    const subtasks = [
      { fields: { status: { name: "To Do" } } },
      { fields: { status: { name: "In Progress" } } },
    ];
    expect(computeSubtaskProgress(subtasks)).toBe(0);
  });

  it("should compute correct percentage", () => {
    const subtasks = [
      { fields: { status: { name: "Done" } } },
      { fields: { status: { name: "In Progress" } } },
      { fields: { status: { name: "To Do" } } },
    ];
    expect(computeSubtaskProgress(subtasks)).toBe(33);
  });

  it("should handle 50% correctly", () => {
    const subtasks = [
      { fields: { status: { name: "Done" } } },
      { fields: { status: { name: "To Do" } } },
    ];
    expect(computeSubtaskProgress(subtasks)).toBe(50);
  });
});

describe("fetchJiraStatus", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let mockClient: JiraClient;

  const TASK_REGISTRATION = { type: "task", dirName: "tasks", idPrefix: "T" };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-jira-sync-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs"), { recursive: true });
    store = new DocumentStore(marvinDir, [TASK_REGISTRATION]);

    mockClient = {
      getIssueWithLinks: vi.fn(),
    } as unknown as JiraClient;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeIssue(overrides: Partial<JiraIssue["fields"]> = {}): JiraIssue {
    return {
      key: "PROJ-1",
      id: "10001",
      self: "https://test.atlassian.net/rest/api/2/issue/10001",
      fields: {
        summary: "Test issue",
        description: null,
        status: { name: "In Progress" },
        issuetype: { name: "Task" },
        priority: { name: "Medium" },
        assignee: null,
        labels: [],
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
        ...overrides,
      },
    };
  }

  it("should return error when artifact not found", async () => {
    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net", "A-999");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("not found");
  });

  it("should return error when artifact has no jiraKey", async () => {
    store.create("action", { title: "No Jira", status: "open" }, "");
    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net", "A-001");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("no jiraKey");
  });

  it("should skip already-done artifacts", async () => {
    store.create("action", {
      title: "Done Action",
      status: "done",
      jiraKey: "PROJ-1",
    } as any, "");

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net");
    expect(result.artifacts).toHaveLength(0);
    expect(vi.mocked(mockClient.getIssueWithLinks)).not.toHaveBeenCalled();
  });

  it("should detect action status change", async () => {
    store.create("action", {
      title: "Test Action",
      status: "open",
      jiraKey: "PROJ-1",
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({ status: { name: "In Progress" } }),
    );

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].statusChanged).toBe(true);
    expect(result.artifacts[0].currentMarvinStatus).toBe("open");
    expect(result.artifacts[0].proposedMarvinStatus).toBe("in-progress");
    // Should NOT have modified the store
    const doc = store.get("A-001")!;
    expect(doc.frontmatter.status).toBe("open");
  });

  it("should detect task status with task-specific mapper", async () => {
    store.create("task", {
      title: "Test Task",
      status: "backlog",
      jiraKey: "PROJ-2",
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({ status: { name: "In Review" } }),
    );

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].proposedMarvinStatus).toBe("review");
  });

  it("should compute proposed progress from subtasks", async () => {
    store.create("action", {
      title: "Action with subtasks",
      status: "open",
      jiraKey: "PROJ-3",
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({
        status: { name: "In Progress" },
        subtasks: [
          { key: "PROJ-4", fields: { summary: "Sub 1", status: { name: "Done" } } },
          { key: "PROJ-5", fields: { summary: "Sub 2", status: { name: "To Do" } } },
          { key: "PROJ-6", fields: { summary: "Sub 3", status: { name: "Done" } } },
        ],
      }),
    );

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].proposedProgress).toBe(67);
    expect(result.artifacts[0].progressChanged).toBe(true);
  });

  it("should not propose progress when progressOverride is set", async () => {
    store.create("action", {
      title: "Override Action",
      status: "open",
      jiraKey: "PROJ-7",
      progress: 90,
      progressOverride: true,
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({
        status: { name: "In Progress" },
        subtasks: [
          { key: "PROJ-8", fields: { summary: "Sub 1", status: { name: "Done" } } },
          { key: "PROJ-9", fields: { summary: "Sub 2", status: { name: "To Do" } } },
        ],
      }),
    );

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net");
    expect(result.artifacts[0].proposedProgress).toBeUndefined();
    expect(result.artifacts[0].progressChanged).toBe(false);
  });

  it("should collect linked issues", async () => {
    store.create("action", {
      title: "Linked Action",
      status: "open",
      jiraKey: "PROJ-10",
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({
        status: { name: "Open" },
        issuelinks: [
          {
            type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
            outwardIssue: {
              key: "PROJ-11",
              fields: { summary: "Blocked issue", status: { name: "To Do" } },
            },
          },
          {
            type: { name: "Relates", inward: "relates to", outward: "relates to" },
            inwardIssue: {
              key: "PROJ-12",
              fields: { summary: "Related issue", status: { name: "Done" } },
            },
          },
        ],
      }),
    );

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net");
    expect(result.artifacts[0].linkedIssues).toHaveLength(2);
    expect(result.artifacts[0].linkedIssues[0].relationship).toBe("blocks");
    expect(result.artifacts[0].linkedIssues[0].isDone).toBe(false);
    expect(result.artifacts[0].linkedIssues[1].relationship).toBe("relates to");
    expect(result.artifacts[0].linkedIssues[1].isDone).toBe(true);
  });

  it("should fetch specific artifact by ID", async () => {
    store.create("action", {
      title: "Action 1",
      status: "open",
      jiraKey: "PROJ-20",
    } as any, "");
    store.create("action", {
      title: "Action 2",
      status: "open",
      jiraKey: "PROJ-21",
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({ status: { name: "Done" } }),
    );

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net", "A-001");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].id).toBe("A-001");
    expect(vi.mocked(mockClient.getIssueWithLinks)).toHaveBeenCalledTimes(1);
  });

  it("should handle API errors gracefully", async () => {
    store.create("action", {
      title: "Error Action",
      status: "open",
      jiraKey: "PROJ-ERR",
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockRejectedValue(
      new Error("Jira API error 404"),
    );

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("PROJ-ERR");
    expect(result.errors[0]).toContain("404");
  });

  it("should report no changes when status matches", async () => {
    store.create("action", {
      title: "Stable Action",
      status: "open",
      jiraKey: "PROJ-30",
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({ status: { name: "Open" } }),
    );

    const result = await fetchJiraStatus(store, mockClient, "test.atlassian.net");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].statusChanged).toBe(false);
    expect(result.artifacts[0].progressChanged).toBe(false);
  });
});

describe("syncJiraProgress", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let mockClient: JiraClient;

  const TASK_REGISTRATION = { type: "task", dirName: "tasks", idPrefix: "T" };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-jira-sync-apply-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs"), { recursive: true });
    store = new DocumentStore(marvinDir, [TASK_REGISTRATION]);

    mockClient = {
      getIssueWithLinks: vi.fn(),
    } as unknown as JiraClient;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeIssue(overrides: Partial<JiraIssue["fields"]> = {}): JiraIssue {
    return {
      key: "PROJ-1",
      id: "10001",
      self: "https://test.atlassian.net/rest/api/2/issue/10001",
      fields: {
        summary: "Test issue",
        description: null,
        status: { name: "In Progress" },
        issuetype: { name: "Task" },
        priority: { name: "Medium" },
        assignee: null,
        labels: [],
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
        ...overrides,
      },
    };
  }

  it("should apply status changes to the store", async () => {
    store.create("action", {
      title: "Test Action",
      status: "open",
      jiraKey: "PROJ-1",
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({ status: { name: "In Progress" } }),
    );

    const result = await syncJiraProgress(store, mockClient, "test.atlassian.net");
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].oldStatus).toBe("open");
    expect(result.updated[0].newStatus).toBe("in-progress");

    const doc = store.get("A-001")!;
    expect(doc.frontmatter.status).toBe("in-progress");
    expect(doc.frontmatter.lastJiraSyncAt).toBeDefined();
  });

  it("should apply progress from subtasks", async () => {
    store.create("action", {
      title: "Action with subtasks",
      status: "open",
      jiraKey: "PROJ-3",
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({
        status: { name: "In Progress" },
        subtasks: [
          { key: "PROJ-4", fields: { summary: "Sub 1", status: { name: "Done" } } },
          { key: "PROJ-5", fields: { summary: "Sub 2", status: { name: "To Do" } } },
        ],
      }),
    );

    const result = await syncJiraProgress(store, mockClient, "test.atlassian.net");
    expect(result.updated).toHaveLength(1);

    const doc = store.get("A-001")!;
    expect(doc.frontmatter.progress).toBe(50);
  });

  it("should report unchanged when no changes needed", async () => {
    store.create("action", {
      title: "Stable Action",
      status: "open",
      jiraKey: "PROJ-30",
    } as any, "");

    vi.mocked(mockClient.getIssueWithLinks).mockResolvedValue(
      makeIssue({ status: { name: "Open" } }),
    );

    const result = await syncJiraProgress(store, mockClient, "test.atlassian.net");
    expect(result.unchanged).toBe(1);
    expect(result.updated).toHaveLength(0);

    // Should still update sync timestamp
    const doc = store.get("A-001")!;
    expect(doc.frontmatter.lastJiraSyncAt).toBeDefined();
  });
});
