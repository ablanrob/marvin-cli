import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { extractJiraKeyFromTags } from "../../../src/skills/builtin/jira/sync.js";
import {
  assessSprintProgress,
  formatProgressReport,
  resolveWeight,
  resolveProgress,
  computeWeightedProgress,
  COMPLEXITY_WEIGHTS,
  STATUS_PROGRESS_DEFAULTS,
  type SprintProgressReport,
  type SprintProgressItemReport,
  type FocusAreaRollup,
} from "../../../src/skills/builtin/jira/sprint-progress.js";
import type { JiraClient } from "../../../src/skills/builtin/jira/client.js";

// Mock the LLM query so tests don't call the real API
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
  tool: vi.fn(),
}));

// --- Helpers ---

function makeItem(overrides: Partial<SprintProgressItemReport> = {}): SprintProgressItemReport {
  return {
    id: "T-001",
    title: "Test task",
    type: "task",
    marvinStatus: "in-progress",
    marvinProgress: 40,
    progress: 40,
    progressSource: "explicit",
    weight: 3,
    weightSource: "default",
    jiraKey: null,
    jiraStatus: null,
    jiraSubtaskProgress: null,
    proposedMarvinStatus: null,
    statusDrift: false,
    progressDrift: false,
    commentSignals: [],
    commentSummary: null,
    children: [],
    owner: null,
    focusArea: null,
    ...overrides,
  };
}

function setupStore(marvinDir: string): DocumentStore {
  const docsDir = path.join(marvinDir, "docs");
  fs.mkdirSync(path.join(docsDir, "sprints"), { recursive: true });
  fs.mkdirSync(path.join(docsDir, "actions"), { recursive: true });
  fs.mkdirSync(path.join(docsDir, "tasks"), { recursive: true });

  // Sprint
  fs.writeFileSync(
    path.join(docsDir, "sprints", "SP-001.md"),
    `---
id: SP-001
title: Sprint 1
type: sprint
status: active
startDate: "2026-03-10"
endDate: "2026-03-24"
created: "2026-03-10T00:00:00Z"
updated: "2026-03-10T00:00:00Z"
tags: []
---
Sprint 1 goals.
`,
  );

  // Action with jiraKey + complexity
  fs.writeFileSync(
    path.join(docsDir, "actions", "A-001.md"),
    `---
id: A-001
title: Build user auth
type: action
status: in-progress
progress: 40
complexity: complex
created: "2026-03-10T00:00:00Z"
updated: "2026-03-15T00:00:00Z"
jiraKey: PROJ-100
tags:
  - sprint:SP-001
  - focus:Authentication
---
Build the user authentication module.
`,
  );

  // Action with jira tag only (no jiraKey field), no complexity
  fs.writeFileSync(
    path.join(docsDir, "actions", "A-002.md"),
    `---
id: A-002
title: Setup CI pipeline
type: action
status: open
created: "2026-03-10T00:00:00Z"
updated: "2026-03-12T00:00:00Z"
tags:
  - sprint:SP-001
  - focus:Infrastructure
  - jira:PROJ-200
---
Set up CI/CD.
`,
  );

  // Task under A-001 with complexity
  fs.writeFileSync(
    path.join(docsDir, "tasks", "T-001.md"),
    `---
id: T-001
title: Implement JWT tokens
type: task
status: in-progress
progress: 50
complexity: moderate
aboutArtifact: A-001
created: "2026-03-11T00:00:00Z"
updated: "2026-03-14T00:00:00Z"
jiraKey: PROJ-101
tags:
  - sprint:SP-001
  - focus:Authentication
---
JWT implementation.
`,
  );

  // Blocked task with prior progress
  fs.writeFileSync(
    path.join(docsDir, "tasks", "T-002.md"),
    `---
id: T-002
title: Database migration
type: task
status: blocked
progress: 30
complexity: very-complex
created: "2026-03-11T00:00:00Z"
updated: "2026-03-13T00:00:00Z"
jiraKey: PROJ-102
tags:
  - sprint:SP-001
  - focus:Infrastructure
---
Blocked on DBA approval.
`,
  );

  return new DocumentStore(marvinDir, [
    { type: "sprint", dirName: "sprints", idPrefix: "SP" },
    { type: "task", dirName: "tasks", idPrefix: "T" },
  ]);
}

function createMockJiraClient(): JiraClient {
  const issues: Record<string, any> = {
    "PROJ-100": {
      key: "PROJ-100",
      fields: {
        summary: "Build user auth",
        status: { name: "In Progress" },
        issuetype: { name: "Story" },
        subtasks: [
          { key: "PROJ-100-1", fields: { summary: "Sub 1", status: { name: "Done" } } },
          { key: "PROJ-100-2", fields: { summary: "Sub 2", status: { name: "In Progress" } } },
        ],
        issuelinks: [],
      },
    },
    "PROJ-101": {
      key: "PROJ-101",
      fields: {
        summary: "Implement JWT tokens",
        status: { name: "In Review" },
        issuetype: { name: "Task" },
        subtasks: [],
        issuelinks: [],
      },
    },
    "PROJ-102": {
      key: "PROJ-102",
      fields: {
        summary: "Database migration",
        status: { name: "Blocked" },
        issuetype: { name: "Task" },
        subtasks: [],
        issuelinks: [],
      },
    },
    "PROJ-200": {
      key: "PROJ-200",
      fields: {
        summary: "Setup CI pipeline",
        status: { name: "To Do" },
        issuetype: { name: "Task" },
        subtasks: [],
        issuelinks: [],
      },
    },
  };

  return {
    getIssueWithLinks: vi.fn(async (key: string) => {
      const issue = issues[key];
      if (!issue) throw new Error(`Issue ${key} not found`);
      return issue;
    }),
    getComments: vi.fn(async () => []),
  } as unknown as JiraClient;
}

// --- Unit tests for resolution helpers ---

describe("resolveWeight", () => {
  it.each([
    ["trivial", 1],
    ["simple", 2],
    ["moderate", 3],
    ["complex", 5],
    ["very-complex", 8],
  ])("maps complexity '%s' → weight %d", (complexity, expected) => {
    const result = resolveWeight(complexity);
    expect(result.weight).toBe(expected);
    expect(result.weightSource).toBe("complexity");
  });

  it("defaults to 3 for undefined complexity", () => {
    const result = resolveWeight(undefined);
    expect(result.weight).toBe(3);
    expect(result.weightSource).toBe("default");
  });

  it("defaults to 3 for unknown complexity", () => {
    const result = resolveWeight("mega-complex");
    expect(result.weight).toBe(3);
    expect(result.weightSource).toBe("default");
  });
});

describe("resolveProgress", () => {
  it("uses explicit progress when set", () => {
    const result = resolveProgress({ progress: 65, status: "in-progress" }, null);
    expect(result.progress).toBe(65);
    expect(result.progressSource).toBe("explicit");
  });

  it("respects explicit progress: 0", () => {
    const result = resolveProgress({ progress: 0, status: "in-progress" }, null);
    expect(result.progress).toBe(0);
    expect(result.progressSource).toBe("explicit");
  });

  it("uses comment-analysis progress when no explicit and analysis available", () => {
    const result = resolveProgress({ status: "in-progress" }, 72);
    expect(result.progress).toBe(72);
    expect(result.progressSource).toBe("comment-analysis");
  });

  it("falls back to status-default when no explicit and no analysis", () => {
    const result = resolveProgress({ status: "in-progress" }, null);
    expect(result.progress).toBe(40);
    expect(result.progressSource).toBe("status-default");
  });

  it.each([
    ["done", 100],
    ["closed", 100],
    ["resolved", 100],
    ["review", 80],
    ["in-progress", 40],
    ["ready", 5],
    ["backlog", 0],
    ["open", 0],
  ])("status '%s' defaults to %d", (status, expected) => {
    const result = resolveProgress({ status }, null);
    expect(result.progress).toBe(expected);
    expect(result.progressSource).toBe("status-default");
  });

  it("blocked status defaults to 10 when no prior value", () => {
    const result = resolveProgress({ status: "blocked" }, null);
    expect(result.progress).toBe(10);
    expect(result.progressSource).toBe("status-default");
  });

  it("blocked with prior explicit progress freezes at that value", () => {
    const result = resolveProgress({ status: "blocked", progress: 55 }, null);
    expect(result.progress).toBe(55);
    expect(result.progressSource).toBe("explicit");
  });

  it("clamps progress to 0-100", () => {
    expect(resolveProgress({ progress: -10, status: "open" }, null).progress).toBe(0);
    expect(resolveProgress({ progress: 150, status: "open" }, null).progress).toBe(100);
  });

  it("explicit progress takes priority over comment-analysis", () => {
    const result = resolveProgress({ progress: 30, status: "in-progress" }, 80);
    expect(result.progress).toBe(30);
    expect(result.progressSource).toBe("explicit");
  });
});

describe("computeWeightedProgress", () => {
  it("computes weighted average", () => {
    const items = [
      makeItem({ progress: 65, weight: 3 }),  // 3 × 65 = 195
      makeItem({ progress: 80, weight: 5 }),   // 5 × 80 = 400
      makeItem({ progress: 0, weight: 3 }),    // 3 × 0 = 0
    ];
    // total weight = 11, weighted sum = 595, 595/11 = 54.09 → 54
    expect(computeWeightedProgress(items)).toBe(54);
  });

  it("returns 0 for empty items", () => {
    expect(computeWeightedProgress([])).toBe(0);
  });

  it("handles single item", () => {
    expect(computeWeightedProgress([makeItem({ progress: 75, weight: 5 })])).toBe(75);
  });

  it("spec example: Analytics focus area", () => {
    const items = [
      makeItem({ progress: 65, weight: 3 }),   // moderate
      makeItem({ progress: 80, weight: 5 }),   // complex
      makeItem({ progress: 0, weight: 3 }),    // moderate
      makeItem({ progress: 50, weight: 3 }),   // moderate
      makeItem({ progress: 70, weight: 3 }),   // moderate
      makeItem({ progress: 30, weight: 3 }),   // moderate
      makeItem({ progress: 55, weight: 3 }),   // default
      makeItem({ progress: 0, weight: 5 }),    // complex
      makeItem({ progress: 85, weight: 3 }),   // default
      makeItem({ progress: 70, weight: 3 }),   // default
      makeItem({ progress: 0, weight: 3 }),    // default
    ];
    // total weight = 37
    // weighted sum = 3*65 + 5*80 + 3*0 + 3*50 + 3*70 + 3*30 + 3*55 + 5*0 + 3*85 + 3*70 + 3*0
    //             = 195 + 400 + 0 + 150 + 210 + 90 + 165 + 0 + 255 + 210 + 0 = 1675
    // 1675/37 = 45.27 → 45
    expect(computeWeightedProgress(items)).toBe(45);
  });
});

// --- Integration tests ---

describe("extractJiraKeyFromTags", () => {
  it("extracts key from jira:KEY tag", () => {
    expect(extractJiraKeyFromTags(["sprint:SP-001", "jira:PROJ-123"])).toBe("PROJ-123");
  });

  it("returns undefined when no jira tag", () => {
    expect(extractJiraKeyFromTags(["sprint:SP-001", "focus:Auth"])).toBeUndefined();
  });

  it("returns undefined for undefined tags", () => {
    expect(extractJiraKeyFromTags(undefined)).toBeUndefined();
  });

  it("returns undefined for empty tags", () => {
    expect(extractJiraKeyFromTags([])).toBeUndefined();
  });

  it("handles mixed case in key", () => {
    expect(extractJiraKeyFromTags(["jira:proj-42"])).toBe("proj-42");
  });
});

describe("assessSprintProgress", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let mockClient: JiraClient;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-sprint-progress-"));
    marvinDir = path.join(tmpDir, ".marvin");
    store = setupStore(marvinDir);
    mockClient = createMockJiraClient();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns error when sprint not found", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-999",
    });
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain("not found");
    expect(report.itemReports).toHaveLength(0);
  });

  it("gathers all sprint-tagged items", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const allIds = report.itemReports.flatMap(r => [r.id, ...r.children.map(c => c.id)]);
    expect(allIds).toContain("A-001");
    expect(allIds).toContain("A-002");
    expect(allIds).toContain("T-001");
    expect(allIds).toContain("T-002");
  });

  it("resolves Jira keys from both jiraKey field and tags", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const a002 = report.itemReports.flatMap(r => [r, ...r.children]).find(r => r.id === "A-002");
    expect(a002?.jiraKey).toBe("PROJ-200");
    expect(a002?.jiraStatus).toBe("To Do");
  });

  it("detects status drift", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const t001 = report.itemReports.flatMap(r => [r, ...r.children]).find(r => r.id === "T-001");
    expect(t001?.statusDrift).toBe(true);
    expect(t001?.proposedMarvinStatus).toBe("review");
    expect(report.driftItems.some(d => d.id === "T-001")).toBe(true);
  });

  it("computes subtask progress from Jira", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const a001 = report.itemReports.find(r => r.id === "A-001");
    expect(a001?.jiraSubtaskProgress).toBe(50);
  });

  it("groups items by focus area", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const authArea = report.focusAreas.find(a => a.name === "Authentication");
    const infraArea = report.focusAreas.find(a => a.name === "Infrastructure");

    expect(authArea).toBeDefined();
    expect(infraArea).toBeDefined();
    expect(authArea!.items.length).toBeGreaterThan(0);
    expect(infraArea!.items.length).toBeGreaterThan(0);
  });

  it("identifies blockers", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    expect(report.blockers.some(b => b.id === "T-002")).toBe(true);
  });

  it("generates proposed updates for drift items", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const statusUpdate = report.proposedUpdates.find(
      u => u.artifactId === "T-001" && u.field === "status",
    );
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate!.proposedValue).toBe("review");
  });

  it("applies updates when applyUpdates=true", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
      applyUpdates: true,
    });

    expect(report.appliedUpdates.length).toBeGreaterThan(0);
    expect(report.proposedUpdates).toHaveLength(0);

    const t001 = store.get("T-001");
    expect(t001?.frontmatter.status).toBe("review");
  });

  it("handles Jira fetch errors gracefully", async () => {
    const failingClient = {
      getIssueWithLinks: vi.fn(async () => { throw new Error("Network error"); }),
      getComments: vi.fn(async () => []),
    } as unknown as JiraClient;

    const report = await assessSprintProgress(store, failingClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.itemReports.length).toBeGreaterThan(0);
  });

  // --- New weighted rollup tests ---

  it("resolves weight from complexity field", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const allItems = report.itemReports.flatMap(r => [r, ...r.children]);
    const a001 = allItems.find(r => r.id === "A-001");
    const t001 = allItems.find(r => r.id === "T-001");
    const t002 = allItems.find(r => r.id === "T-002");
    const a002 = allItems.find(r => r.id === "A-002");

    expect(a001?.weight).toBe(5); // complex
    expect(a001?.weightSource).toBe("complexity");
    expect(t001?.weight).toBe(3); // moderate
    expect(t001?.weightSource).toBe("complexity");
    expect(t002?.weight).toBe(8); // very-complex
    expect(t002?.weightSource).toBe("complexity");
    expect(a002?.weight).toBe(3); // no complexity → default
    expect(a002?.weightSource).toBe("default");
  });

  it("populates progressSource on every item", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const allItems = report.itemReports.flatMap(r => [r, ...r.children]);
    for (const item of allItems) {
      expect(["explicit", "comment-analysis", "status-default"]).toContain(item.progressSource);
    }

    // A-001 has children → progress derived from child weighted average
    const a001 = allItems.find(r => r.id === "A-001");
    expect(a001?.progressSource).toBe("status-default"); // derived from children

    // T-001 has explicit progress: 50
    const t001 = allItems.find(r => r.id === "T-001");
    expect(t001?.progressSource).toBe("explicit");

    // T-002 has explicit progress: 30 (blocked but has prior value)
    const t002 = allItems.find(r => r.id === "T-002");
    expect(t002?.progress).toBe(30);
    expect(t002?.progressSource).toBe("explicit");
  });

  it("uses status-default progress for items without explicit progress", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    // A-002 has no progress field, status=open → 0%
    const a002 = report.itemReports.find(r => r.id === "A-002");
    expect(a002?.progress).toBe(0);
    expect(a002?.progressSource).toBe("status-default");
  });

  it("computes weighted focus area progress", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    for (const area of report.focusAreas) {
      expect(typeof area.progress).toBe("number");
      expect(area.progress).toBeGreaterThanOrEqual(0);
      expect(area.progress).toBeLessThanOrEqual(100);
    }
  });

  it("action with children gets weighted average from children", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const a001 = report.itemReports.find(r => r.id === "A-001");
    expect(a001).toBeDefined();
    expect(a001!.children.length).toBeGreaterThan(0);
    // A-001 has child T-001 (progress: 50, weight: 3)
    // Weighted average of children: 50*3/3 = 50
    expect(a001!.progress).toBe(50);
  });

  it("no double-counting: children contribute via parent only in focus rollup", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const authArea = report.focusAreas.find(a => a.name === "Authentication");
    expect(authArea).toBeDefined();
    // Root items in Auth: A-001 only (T-001 is nested under it)
    expect(authArea!.items.length).toBe(1);
    expect(authArea!.items[0].id).toBe("A-001");
  });

  it("blocked items freeze progress at prior value", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const allItems = report.itemReports.flatMap(r => [r, ...r.children]);
    const t002 = allItems.find(r => r.id === "T-002");
    // T-002 is blocked with explicit progress: 30 → freezes at 30
    expect(t002?.progress).toBe(30);
  });

  it("reports blockedWeightPct per focus area", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const infraArea = report.focusAreas.find(a => a.name === "Infrastructure");
    expect(infraArea).toBeDefined();
    expect(typeof infraArea!.blockedWeightPct).toBe("number");
    // Infrastructure has A-002 (w3, open) and T-002 (w8, blocked)
    // T-002 is nested under... let's check — T-002 has no aboutArtifact pointing to A-002
    // so both are root items. Blocked weight: 8/(3+8) = 72.7%
    expect(infraArea!.blockedWeightPct).toBeGreaterThan(30);
  });

  it("emits risk warning when blocked weight exceeds 30%", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const infraArea = report.focusAreas.find(a => a.name === "Infrastructure");
    expect(infraArea).toBeDefined();
    expect(infraArea!.riskWarning).not.toBeNull();
    expect(infraArea!.riskWarning).toContain("blocked");
  });

  it("excludes items without focus tag from focus area rollups", async () => {
    // Add a task with no focus tag
    const docsDir = path.join(marvinDir, "docs");
    fs.writeFileSync(
      path.join(docsDir, "tasks", "T-003.md"),
      `---
id: T-003
title: Unfocused task
type: task
status: in-progress
progress: 50
created: "2026-03-11T00:00:00Z"
updated: "2026-03-14T00:00:00Z"
tags:
  - sprint:SP-001
---
No focus tag.
`,
    );
    const newStore = new DocumentStore(marvinDir, [
      { type: "sprint", dirName: "sprints", idPrefix: "SP" },
      { type: "task", dirName: "tasks", idPrefix: "T" },
    ]);

    const report = await assessSprintProgress(newStore, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    // T-003 should appear in itemReports but not in any focus area
    const allFocusItems = report.focusAreas.flatMap(a => a.items.flatMap(i => [i, ...i.children]));
    expect(allFocusItems.find(i => i.id === "T-003")).toBeUndefined();
    const allReportItems = report.itemReports.flatMap(r => [r, ...r.children]);
    expect(allReportItems.find(i => i.id === "T-003")).toBeDefined();
  });
});

describe("formatProgressReport", () => {
  it("formats a minimal report", () => {
    const report: SprintProgressReport = {
      sprintId: "SP-001",
      sprintTitle: "Sprint 1",
      generatedAt: "2026-03-20T10:00:00Z",
      timeline: {
        startDate: "2026-03-10",
        endDate: "2026-03-24",
        daysRemaining: 4,
        totalDays: 14,
        percentComplete: 71,
      },
      overallProgress: 45,
      itemReports: [],
      focusAreas: [],
      driftItems: [],
      blockers: [],
      proposedUpdates: [],
      appliedUpdates: [],
      errors: [],
    };

    const text = formatProgressReport(report);
    expect(text).toContain("Sprint Progress Assessment — SP-001");
    expect(text).toContain("Sprint 1");
    expect(text).toContain("Days remaining: 4 / 14");
    expect(text).toContain("Overall progress: 45%");
  });

  it("renders focus areas with progress bars and weight info", () => {
    const report: SprintProgressReport = {
      sprintId: "SP-001",
      sprintTitle: "Sprint 1",
      generatedAt: "2026-03-20T10:00:00Z",
      timeline: {
        startDate: "2026-03-10",
        endDate: "2026-03-24",
        daysRemaining: 4,
        totalDays: 14,
        percentComplete: 71,
      },
      overallProgress: 50,
      itemReports: [],
      focusAreas: [
        {
          name: "Authentication",
          progress: 50,
          taskCount: 1,
          doneCount: 0,
          blockedCount: 0,
          blockedWeightPct: 0,
          riskWarning: null,
          items: [makeItem({
            id: "A-001",
            title: "Build auth",
            type: "action",
            marvinStatus: "in-progress",
            progress: 50,
            progressSource: "explicit",
            weight: 5,
            weightSource: "complexity",
            jiraKey: "PROJ-100",
            jiraStatus: "In Progress",
            focusArea: "Authentication",
          })],
        },
      ],
      driftItems: [],
      blockers: [],
      proposedUpdates: [],
      appliedUpdates: [],
      errors: [],
    };

    const text = formatProgressReport(report);
    expect(text).toContain("Authentication");
    expect(text).toContain("█████░░░░░"); // 50% → 5 filled, 5 empty
    expect(text).toContain("A-001");
    expect(text).toContain("w5"); // weight shown
  });

  it("renders risk warning for focus area", () => {
    const report: SprintProgressReport = {
      sprintId: "SP-001",
      sprintTitle: "Sprint 1",
      generatedAt: "2026-03-20T10:00:00Z",
      timeline: { startDate: null, endDate: null, daysRemaining: 0, totalDays: 0, percentComplete: 0 },
      overallProgress: 10,
      itemReports: [],
      focusAreas: [
        {
          name: "Infrastructure",
          progress: 10,
          taskCount: 2,
          doneCount: 0,
          blockedCount: 1,
          blockedWeightPct: 73,
          riskWarning: "73% of scope is blocked",
          items: [],
        },
      ],
      driftItems: [],
      blockers: [],
      proposedUpdates: [],
      appliedUpdates: [],
      errors: [],
    };

    const text = formatProgressReport(report);
    expect(text).toContain("73% of scope is blocked");
  });

  it("renders drift and blocker sections", () => {
    const driftItem = makeItem({
      id: "T-001",
      title: "JWT",
      marvinStatus: "in-progress",
      progress: 50,
      jiraKey: "PROJ-101",
      jiraStatus: "In Review",
      proposedMarvinStatus: "review",
      statusDrift: true,
    });

    const blockerItem = makeItem({
      id: "T-002",
      title: "DB Migration",
      marvinStatus: "blocked",
      progress: 30,
      jiraKey: "PROJ-102",
      jiraStatus: "Blocked",
      commentSignals: [{ type: "blocker" as const, snippet: "Waiting for DBA approval" }],
    });

    const report: SprintProgressReport = {
      sprintId: "SP-001",
      sprintTitle: "Sprint 1",
      generatedAt: "2026-03-20T10:00:00Z",
      timeline: { startDate: null, endDate: null, daysRemaining: 0, totalDays: 0, percentComplete: 0 },
      overallProgress: 30,
      itemReports: [],
      focusAreas: [],
      driftItems: [driftItem],
      blockers: [blockerItem],
      proposedUpdates: [{
        artifactId: "T-001",
        field: "status",
        currentValue: "in-progress",
        proposedValue: "review",
        reason: 'Jira PROJ-101 is "In Review"',
      }],
      appliedUpdates: [],
      errors: [],
    };

    const text = formatProgressReport(report);
    expect(text).toContain("Status Drift (1 items)");
    expect(text).toContain("in-progress → review");
    expect(text).toContain("Blockers (1)");
    expect(text).toContain("T-002");
    expect(text).toContain("Proposed Updates (1)");
    expect(text).toContain("applyUpdates=true");
  });

  it("shows progress source labels", () => {
    const items = [
      makeItem({ id: "T-010", title: "Explicit", progress: 50, progressSource: "explicit", weight: 3 }),
      makeItem({ id: "T-011", title: "Estimated", progress: 40, progressSource: "status-default", weight: 3 }),
      makeItem({ id: "T-012", title: "LLM", progress: 65, progressSource: "comment-analysis", weight: 3 }),
    ];

    const report: SprintProgressReport = {
      sprintId: "SP-001",
      sprintTitle: "Sprint 1",
      generatedAt: "2026-03-20T10:00:00Z",
      timeline: { startDate: null, endDate: null, daysRemaining: 0, totalDays: 0, percentComplete: 0 },
      overallProgress: 50,
      itemReports: items,
      focusAreas: [{
        name: "Test",
        progress: 52,
        taskCount: 3,
        doneCount: 0,
        blockedCount: 0,
        blockedWeightPct: 0,
        riskWarning: null,
        items,
      }],
      driftItems: [],
      blockers: [],
      proposedUpdates: [],
      appliedUpdates: [],
      errors: [],
    };

    const text = formatProgressReport(report);
    // Explicit items have no label suffix
    expect(text).toMatch(/T-010.*50%[^(]/);
    // Status-default shows (est)
    expect(text).toContain("(est)");
    // Comment-analysis shows (llm)
    expect(text).toContain("(llm)");
  });
});
