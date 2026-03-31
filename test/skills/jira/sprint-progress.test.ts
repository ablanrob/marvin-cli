import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { extractJiraKeyFromTags } from "../../../src/skills/builtin/jira/sync.js";
import {
  assessSprintProgress,
  formatProgressReport,
  assessArtifact,
  formatArtifactReport,
  resolveWeight,
  resolveProgress,
  computeWeightedProgress,
  type SprintProgressReport,
  type SprintProgressItemReport,
  type ArtifactAssessmentReport,
  parseCommentAnalysis,
  buildAssessmentSummary,
  computeBlockerProgress,
} from "../../../src/skills/builtin/jira/sprint-progress.js";
import { collectLinkedIssues } from "../../../src/skills/builtin/jira/sync.js";
import type { JiraClient, JiraIssue } from "../../../src/skills/builtin/jira/client.js";

// Mock the LLM query so tests don't call the real API
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
  tool: vi.fn(),
}));

// --- Helpers ---

function makeArtifactReport(
  overrides: Partial<ArtifactAssessmentReport> = {},
): ArtifactAssessmentReport {
  return {
    artifactId: "T-001",
    title: "Test task",
    type: "task",
    marvinStatus: "in-progress",
    marvinProgress: 40,
    sprint: null,
    parent: null,
    jiraKey: null,
    jiraStatus: null,
    jiraAssignee: null,
    jiraSubtaskProgress: null,
    proposedMarvinStatus: null,
    statusDrift: false,
    progressDrift: false,
    commentSignals: [],
    commentSummary: null,
    commentAnalysisProgress: null,
    linkedIssues: [],
    linkedIssueSignals: [],
    blockerProgress: null,
    totalBlockers: 0,
    resolvedBlockers: 0,
    children: [],
    proposedUpdates: [],
    appliedUpdates: [],
    signals: [],
    errors: [],
    ...overrides,
  };
}

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
    linkedIssues: [],
    linkedIssueSignals: [],
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

function createMockJiraClient(options?: { withLinks?: boolean }): JiraClient {
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
        issuelinks: options?.withLinks
          ? [
              {
                type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
                outwardIssue: {
                  key: "PROJ-301",
                  fields: { summary: "Setup infra", status: { name: "Done" } },
                },
              },
            ]
          : [],
      },
    },
    "PROJ-101": {
      key: "PROJ-101",
      fields: {
        summary: "Implement JWT tokens",
        status: { name: "In Review" },
        issuetype: { name: "Task" },
        subtasks: [],
        issuelinks: options?.withLinks
          ? [
              {
                type: { name: "Relates", inward: "relates to", outward: "relates to" },
                outwardIssue: {
                  key: "PROJ-302",
                  fields: { summary: "DBA approval", status: { name: "In Progress" } },
                },
              },
            ]
          : [],
      },
    },
    "PROJ-102": {
      key: "PROJ-102",
      fields: {
        summary: "Database migration",
        status: { name: "Blocked" },
        issuetype: { name: "Task" },
        subtasks: [],
        issuelinks: options?.withLinks
          ? [
              {
                type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
                inwardIssue: {
                  key: "PROJ-303",
                  fields: { summary: "DBA sign-off", status: { name: "Done" } },
                },
              },
              {
                type: { name: "Relates", inward: "relates to", outward: "relates to" },
                outwardIssue: {
                  key: "PROJ-304",
                  fields: { summary: "Cancelled feature", status: { name: "Wont Do" } },
                },
              },
            ]
          : [],
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
    // Linked issues (fetched during traversal)
    "PROJ-301": {
      key: "PROJ-301",
      fields: {
        summary: "Setup infra",
        status: { name: "Done" },
        issuetype: { name: "Task" },
        subtasks: [],
        issuelinks: [],
      },
    },
    "PROJ-302": {
      key: "PROJ-302",
      fields: {
        summary: "DBA approval",
        status: { name: "In Progress" },
        issuetype: { name: "Task" },
        subtasks: [],
        // 2nd hop: PROJ-302 links to PROJ-305 (only discovered via recursive traversal)
        issuelinks: options?.withLinks
          ? [
              {
                type: { name: "Relates", inward: "relates to", outward: "relates to" },
                outwardIssue: {
                  key: "PROJ-305",
                  fields: { summary: "Schema design doc", status: { name: "Done" } },
                },
              },
            ]
          : [],
      },
    },
    "PROJ-303": {
      key: "PROJ-303",
      fields: {
        summary: "DBA sign-off",
        status: { name: "Done" },
        issuetype: { name: "Task" },
        subtasks: [],
        issuelinks: [],
      },
    },
    "PROJ-304": {
      key: "PROJ-304",
      fields: {
        summary: "Cancelled feature",
        status: { name: "Wont Do" },
        issuetype: { name: "Task" },
        subtasks: [],
        issuelinks: [],
      },
    },
    // 2nd-hop issue: only reachable via PROJ-302 → PROJ-305
    "PROJ-305": {
      key: "PROJ-305",
      fields: {
        summary: "Schema design doc",
        status: { name: "Done" },
        issuetype: { name: "Task" },
        subtasks: [],
        // Circular link back to PROJ-302 — tests cycle safety
        issuelinks: options?.withLinks
          ? [
              {
                type: { name: "Relates", inward: "relates to", outward: "relates to" },
                inwardIssue: {
                  key: "PROJ-302",
                  fields: { summary: "DBA approval", status: { name: "In Progress" } },
                },
              },
            ]
          : [],
      },
    },
  };

  const comments: Record<string, any[]> = {
    "PROJ-303": [
      {
        id: "1",
        author: { displayName: "DBA Team" },
        created: "2026-03-18T10:00:00Z",
        body: "DBA review completed, migration approved.",
      },
    ],
  };

  return {
    getIssueWithLinks: vi.fn(async (key: string) => {
      const issue = issues[key];
      if (!issue) throw new Error(`Issue ${key} not found`);
      return issue;
    }),
    getComments: vi.fn(async (key: string) => comments[key] ?? []),
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
      makeItem({ progress: 65, weight: 3 }), // 3 × 65 = 195
      makeItem({ progress: 80, weight: 5 }), // 5 × 80 = 400
      makeItem({ progress: 0, weight: 3 }), // 3 × 0 = 0
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
      makeItem({ progress: 65, weight: 3 }), // moderate
      makeItem({ progress: 80, weight: 5 }), // complex
      makeItem({ progress: 0, weight: 3 }), // moderate
      makeItem({ progress: 50, weight: 3 }), // moderate
      makeItem({ progress: 70, weight: 3 }), // moderate
      makeItem({ progress: 30, weight: 3 }), // moderate
      makeItem({ progress: 55, weight: 3 }), // default
      makeItem({ progress: 0, weight: 5 }), // complex
      makeItem({ progress: 85, weight: 3 }), // default
      makeItem({ progress: 70, weight: 3 }), // default
      makeItem({ progress: 0, weight: 3 }), // default
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

    const allIds = report.itemReports.flatMap((r) => [r.id, ...r.children.map((c) => c.id)]);
    expect(allIds).toContain("A-001");
    expect(allIds).toContain("A-002");
    expect(allIds).toContain("T-001");
    expect(allIds).toContain("T-002");
  });

  it("resolves Jira keys from both jiraKey field and tags", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const a002 = report.itemReports
      .flatMap((r) => [r, ...r.children])
      .find((r) => r.id === "A-002");
    expect(a002?.jiraKey).toBe("PROJ-200");
    expect(a002?.jiraStatus).toBe("To Do");
  });

  it("detects status drift", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const t001 = report.itemReports
      .flatMap((r) => [r, ...r.children])
      .find((r) => r.id === "T-001");
    expect(t001?.statusDrift).toBe(true);
    expect(t001?.proposedMarvinStatus).toBe("review");
    expect(report.driftItems.some((d) => d.id === "T-001")).toBe(true);
  });

  it("computes subtask progress from Jira", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const a001 = report.itemReports.find((r) => r.id === "A-001");
    expect(a001?.jiraSubtaskProgress).toBe(50);
  });

  it("groups items by focus area", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const authArea = report.focusAreas.find((a) => a.name === "Authentication");
    const infraArea = report.focusAreas.find((a) => a.name === "Infrastructure");

    expect(authArea).toBeDefined();
    expect(infraArea).toBeDefined();
    expect(authArea!.items.length).toBeGreaterThan(0);
    expect(infraArea!.items.length).toBeGreaterThan(0);
  });

  it("identifies blockers", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    expect(report.blockers.some((b) => b.id === "T-002")).toBe(true);
  });

  it("generates proposed updates for drift items", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const statusUpdate = report.proposedUpdates.find(
      (u) => u.artifactId === "T-001" && u.field === "status",
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
      getIssueWithLinks: vi.fn(async () => {
        throw new Error("Network error");
      }),
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

    const allItems = report.itemReports.flatMap((r) => [r, ...r.children]);
    const a001 = allItems.find((r) => r.id === "A-001");
    const t001 = allItems.find((r) => r.id === "T-001");
    const t002 = allItems.find((r) => r.id === "T-002");
    const a002 = allItems.find((r) => r.id === "A-002");

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

    const allItems = report.itemReports.flatMap((r) => [r, ...r.children]);
    for (const item of allItems) {
      expect(["explicit", "comment-analysis", "status-default"]).toContain(item.progressSource);
    }

    // A-001 has children → progress derived from child weighted average
    const a001 = allItems.find((r) => r.id === "A-001");
    expect(a001?.progressSource).toBe("status-default"); // derived from children

    // T-001 has explicit progress: 50
    const t001 = allItems.find((r) => r.id === "T-001");
    expect(t001?.progressSource).toBe("explicit");

    // T-002 has explicit progress: 30 (blocked but has prior value)
    const t002 = allItems.find((r) => r.id === "T-002");
    expect(t002?.progress).toBe(30);
    expect(t002?.progressSource).toBe("explicit");
  });

  it("uses status-default progress for items without explicit progress", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    // A-002 has no progress field, status=open → 0%
    const a002 = report.itemReports.find((r) => r.id === "A-002");
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

    const a001 = report.itemReports.find((r) => r.id === "A-001");
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

    const authArea = report.focusAreas.find((a) => a.name === "Authentication");
    expect(authArea).toBeDefined();
    // Root items in Auth: A-001 only (T-001 is nested under it)
    expect(authArea!.items.length).toBe(1);
    expect(authArea!.items[0].id).toBe("A-001");
  });

  it("blocked items freeze progress at prior value", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const allItems = report.itemReports.flatMap((r) => [r, ...r.children]);
    const t002 = allItems.find((r) => r.id === "T-002");
    // T-002 is blocked with explicit progress: 30 → freezes at 30
    expect(t002?.progress).toBe(30);
  });

  it("reports blockedWeightPct per focus area", async () => {
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
    });

    const infraArea = report.focusAreas.find((a) => a.name === "Infrastructure");
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

    const infraArea = report.focusAreas.find((a) => a.name === "Infrastructure");
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
    const allFocusItems = report.focusAreas.flatMap((a) =>
      a.items.flatMap((i) => [i, ...i.children]),
    );
    expect(allFocusItems.find((i) => i.id === "T-003")).toBeUndefined();
    const allReportItems = report.itemReports.flatMap((r) => [r, ...r.children]);
    expect(allReportItems.find((i) => i.id === "T-003")).toBeDefined();
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
          items: [
            makeItem({
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
            }),
          ],
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
      timeline: {
        startDate: null,
        endDate: null,
        daysRemaining: 0,
        totalDays: 0,
        percentComplete: 0,
      },
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
      timeline: {
        startDate: null,
        endDate: null,
        daysRemaining: 0,
        totalDays: 0,
        percentComplete: 0,
      },
      overallProgress: 30,
      itemReports: [],
      focusAreas: [],
      driftItems: [driftItem],
      blockers: [blockerItem],
      proposedUpdates: [
        {
          artifactId: "T-001",
          field: "status",
          currentValue: "in-progress",
          proposedValue: "review",
          reason: 'Jira PROJ-101 is "In Review"',
        },
      ],
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
      makeItem({
        id: "T-010",
        title: "Explicit",
        progress: 50,
        progressSource: "explicit",
        weight: 3,
      }),
      makeItem({
        id: "T-011",
        title: "Estimated",
        progress: 40,
        progressSource: "status-default",
        weight: 3,
      }),
      makeItem({
        id: "T-012",
        title: "LLM",
        progress: 65,
        progressSource: "comment-analysis",
        weight: 3,
      }),
    ];

    const report: SprintProgressReport = {
      sprintId: "SP-001",
      sprintTitle: "Sprint 1",
      generatedAt: "2026-03-20T10:00:00Z",
      timeline: {
        startDate: null,
        endDate: null,
        daysRemaining: 0,
        totalDays: 0,
        percentComplete: 0,
      },
      overallProgress: 50,
      itemReports: items,
      focusAreas: [
        {
          name: "Test",
          progress: 52,
          taskCount: 3,
          doneCount: 0,
          blockedCount: 0,
          blockedWeightPct: 0,
          riskWarning: null,
          items,
        },
      ],
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

  it("renders linked issues section", () => {
    const item = makeItem({
      id: "A-001",
      title: "Build auth",
      type: "action",
      marvinStatus: "in-progress",
      progress: 50,
      jiraKey: "PROJ-100",
      jiraStatus: "In Progress",
      linkedIssues: [
        {
          key: "PROJ-301",
          summary: "Setup infra",
          status: "Done",
          relationship: "blocks",
          isDone: true,
        },
        {
          key: "PROJ-302",
          summary: "DBA approval",
          status: "In Progress",
          relationship: "is blocked by",
          isDone: false,
        },
      ],
      linkedIssueSignals: [
        { sourceKey: "PROJ-301", linkType: "blocks", commentSignals: [], commentSummary: null },
        {
          sourceKey: "PROJ-302",
          linkType: "is blocked by",
          commentSignals: [],
          commentSummary: "DBA review scheduled for Thursday",
        },
      ],
    });

    const report: SprintProgressReport = {
      sprintId: "SP-001",
      sprintTitle: "Sprint 1",
      generatedAt: "2026-03-20T10:00:00Z",
      timeline: {
        startDate: null,
        endDate: null,
        daysRemaining: 0,
        totalDays: 0,
        percentComplete: 0,
      },
      overallProgress: 50,
      itemReports: [item],
      focusAreas: [
        {
          name: "Auth",
          progress: 50,
          taskCount: 1,
          doneCount: 0,
          blockedCount: 0,
          blockedWeightPct: 0,
          riskWarning: null,
          items: [item],
        },
      ],
      driftItems: [],
      blockers: [],
      proposedUpdates: [],
      appliedUpdates: [],
      errors: [],
    };

    const text = formatProgressReport(report);
    expect(text).toContain("🔗 Linked Issues:");
    expect(text).toContain('blocks PROJ-301 "Setup infra" [Done] ✓ unblock signal');
    expect(text).toContain('is blocked by PROJ-302 "DBA approval" [In Progress]');
    expect(text).toContain("💬 DBA review scheduled for Thursday");
  });

  it("renders won't do warning on linked issues", () => {
    const item = makeItem({
      id: "T-001",
      title: "Task",
      linkedIssues: [
        {
          key: "PROJ-304",
          summary: "Cancelled feature",
          status: "Wont Do",
          relationship: "relates to",
          isDone: false,
        },
      ],
      linkedIssueSignals: [],
    });

    const report: SprintProgressReport = {
      sprintId: "SP-001",
      sprintTitle: "Sprint 1",
      generatedAt: "2026-03-20T10:00:00Z",
      timeline: {
        startDate: null,
        endDate: null,
        daysRemaining: 0,
        totalDays: 0,
        percentComplete: 0,
      },
      overallProgress: 0,
      itemReports: [item],
      focusAreas: [
        {
          name: "Test",
          progress: 0,
          taskCount: 1,
          doneCount: 0,
          blockedCount: 0,
          blockedWeightPct: 0,
          riskWarning: null,
          items: [item],
        },
      ],
      driftItems: [],
      blockers: [],
      proposedUpdates: [],
      appliedUpdates: [],
      errors: [],
    };

    const text = formatProgressReport(report);
    expect(text).toContain("⚠ needs review");
  });
});

// --- collectLinkedIssues unit tests ---

describe("collectLinkedIssues", () => {
  it("extracts subtasks", () => {
    const issue = {
      key: "PROJ-100",
      id: "1",
      self: "",
      fields: {
        summary: "Test",
        description: null,
        status: { name: "In Progress" },
        issuetype: { name: "Story" },
        priority: null,
        assignee: null,
        labels: [],
        created: "",
        updated: "",
        subtasks: [{ key: "PROJ-100-1", fields: { summary: "Sub 1", status: { name: "Done" } } }],
        issuelinks: [],
      },
    } as JiraIssue;

    const result = collectLinkedIssues(issue);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("PROJ-100-1");
    expect(result[0].relationship).toBe("subtask");
    expect(result[0].isDone).toBe(true);
  });

  it("extracts outward and inward issue links", () => {
    const issue = {
      key: "PROJ-100",
      id: "1",
      self: "",
      fields: {
        summary: "Test",
        description: null,
        status: { name: "In Progress" },
        issuetype: { name: "Story" },
        priority: null,
        assignee: null,
        labels: [],
        created: "",
        updated: "",
        subtasks: [],
        issuelinks: [
          {
            type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
            outwardIssue: {
              key: "PROJ-200",
              fields: { summary: "Blocked task", status: { name: "To Do" } },
            },
          },
          {
            type: { name: "Relates", inward: "relates to", outward: "relates to" },
            inwardIssue: {
              key: "PROJ-300",
              fields: { summary: "Related task", status: { name: "Done" } },
            },
          },
        ],
      },
    } as JiraIssue;

    const result = collectLinkedIssues(issue);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      key: "PROJ-200",
      summary: "Blocked task",
      status: "To Do",
      relationship: "blocks",
      isDone: false,
    });
    expect(result[1]).toEqual({
      key: "PROJ-300",
      summary: "Related task",
      status: "Done",
      relationship: "relates to",
      isDone: true,
    });
  });

  it("returns empty array for issue with no links", () => {
    const issue = {
      key: "PROJ-100",
      id: "1",
      self: "",
      fields: {
        summary: "Test",
        description: null,
        status: { name: "Open" },
        issuetype: { name: "Task" },
        priority: null,
        assignee: null,
        labels: [],
        created: "",
        updated: "",
      },
    } as JiraIssue;

    const result = collectLinkedIssues(issue);
    expect(result).toHaveLength(0);
  });
});

// --- Link traversal integration tests ---

describe("assessSprintProgress with traverseLinks", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-sprint-links-"));
    marvinDir = path.join(tmpDir, ".marvin");
    store = setupStore(marvinDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("traverseLinks=false (default) → no linked issues fetched", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
      traverseLinks: false,
    });

    const allItems = report.itemReports.flatMap((r) => [r, ...r.children]);
    for (const item of allItems) {
      expect(item.linkedIssues).toHaveLength(0);
      expect(item.linkedIssueSignals).toHaveLength(0);
    }
  });

  it("traverseLinks=true → linked issues populated", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
      traverseLinks: true,
    });

    const allItems = report.itemReports.flatMap((r) => [r, ...r.children]);

    // A-001 has one outward link: blocks PROJ-301
    const a001 = allItems.find((r) => r.id === "A-001");
    expect(a001?.linkedIssues).toHaveLength(1);
    expect(a001?.linkedIssues[0].key).toBe("PROJ-301");
    expect(a001?.linkedIssues[0].relationship).toBe("blocks");

    // T-001 links to PROJ-302, which transitively links to PROJ-305
    const t001 = allItems.find((r) => r.id === "T-001");
    expect(t001?.linkedIssues.length).toBeGreaterThanOrEqual(1);
    expect(t001?.linkedIssues.some((l) => l.key === "PROJ-302")).toBe(true);
    // 2nd hop: PROJ-305 is discovered via PROJ-302
    expect(t001?.linkedIssues.some((l) => l.key === "PROJ-305")).toBe(true);
  });

  it("traverseLinks=true → linked issues fetched via client", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
      traverseLinks: true,
    });

    // Linked issue keys should have been fetched
    const fetchedKeys = (mockClient.getIssueWithLinks as any).mock.calls.map((c: any[]) => c[0]);
    expect(fetchedKeys).toContain("PROJ-301");
    expect(fetchedKeys).toContain("PROJ-302");
    expect(fetchedKeys).toContain("PROJ-303");
    expect(fetchedKeys).toContain("PROJ-304");
  });

  it("blocker-resolved signal detection → proposes unblock", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
      traverseLinks: true,
    });

    // T-002 is blocked and has a blocker link (PROJ-303) that is Done
    const unblockUpdate = report.proposedUpdates.find(
      (u) =>
        u.artifactId === "T-002" &&
        u.field === "status" &&
        u.reason.includes("blocking issues resolved"),
    );
    expect(unblockUpdate).toBeDefined();
    expect(unblockUpdate!.proposedValue).toBe("in-progress");
    expect(unblockUpdate!.reason).toContain("PROJ-303");
  });

  it("won't do linked issue → flags for review", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
      traverseLinks: true,
    });

    // T-002 has a linked issue PROJ-304 with status "Wont Do"
    const reviewUpdate = report.proposedUpdates.find(
      (u) => u.artifactId === "T-002" && u.field === "review",
    );
    expect(reviewUpdate).toBeDefined();
    expect(reviewUpdate!.reason).toContain("PROJ-304");
    expect(reviewUpdate!.reason).toContain("cancelled/won't do");
  });

  it("linked issue comments are extracted as signals", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
      traverseLinks: true,
    });

    const allItems = report.itemReports.flatMap((r) => [r, ...r.children]);
    const t002 = allItems.find((r) => r.id === "T-002");
    // T-002 links to PROJ-303 which has comments
    const signal303 = t002?.linkedIssueSignals.find((s) => s.sourceKey === "PROJ-303");
    expect(signal303).toBeDefined();
    expect(signal303!.linkType).toBe("is blocked by");
  });

  it("multi-hop: discovers 2nd-hop linked issues via recursive traversal", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
      traverseLinks: true,
    });

    // T-001 → PROJ-302 → PROJ-305 (2nd hop)
    // PROJ-305 should be fetched and appear in T-001's linked issues
    const allItems = report.itemReports.flatMap((r) => [r, ...r.children]);
    const t001 = allItems.find((r) => r.id === "T-001");
    expect(t001?.linkedIssues.some((l) => l.key === "PROJ-305")).toBe(true);

    // PROJ-305 was fetched via getIssueWithLinks
    const fetchedKeys = (mockClient.getIssueWithLinks as any).mock.calls.map((c: any[]) => c[0]);
    expect(fetchedKeys).toContain("PROJ-305");
  });

  it("handles circular links without infinite loop", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    // PROJ-302 → PROJ-305 → PROJ-302 (circular)
    // Should complete without hanging
    const report = await assessSprintProgress(store, mockClient, "jira.example.com", {
      sprintId: "SP-001",
      traverseLinks: true,
    });

    // Verify PROJ-302 was fetched exactly once (not re-fetched via circular link)
    const fetchCalls = (mockClient.getIssueWithLinks as any).mock.calls.map((c: any[]) => c[0]);
    const proj302Fetches = fetchCalls.filter((k: string) => k === "PROJ-302");
    expect(proj302Fetches).toHaveLength(1);

    // Report should still be valid
    expect(report.errors).toHaveLength(0);
  });
});

// ========================================================================
// assessArtifact tests
// ========================================================================

describe("assessArtifact", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-assess-artifact-"));
    marvinDir = path.join(tmpDir, ".marvin");
    store = setupStore(marvinDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns error for unknown artifact", async () => {
    const mockClient = createMockJiraClient();
    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-999",
    });
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain("not found");
    expect(report.type).toBe("unknown");
  });

  it("loads artifact and fetches Jira status", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
    });

    expect(report.artifactId).toBe("T-001");
    expect(report.title).toBe("Implement JWT tokens");
    expect(report.type).toBe("task");
    expect(report.jiraKey).toBe("PROJ-101");
    expect(report.jiraStatus).toBe("In Review");
    expect(report.marvinStatus).toBe("in-progress");
  });

  it("detects status drift", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
    });

    expect(report.statusDrift).toBe(true);
    expect(report.proposedMarvinStatus).toBe("review");
    expect(report.proposedUpdates.some((u) => u.field === "status")).toBe(true);
  });

  it("traverses linked issues recursively", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
    });

    // T-001 (PROJ-101) → PROJ-302 → PROJ-305 (2nd hop)
    expect(report.linkedIssues.some((l) => l.key === "PROJ-302")).toBe(true);
    expect(report.linkedIssues.some((l) => l.key === "PROJ-305")).toBe(true);
  });

  it("recursively assesses children with Jira data and drift detection", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "A-001",
    });

    // A-001 has T-001 as a child (aboutArtifact: A-001)
    expect(report.children.length).toBeGreaterThanOrEqual(1);
    const t001Child = report.children.find((c) => c.artifactId === "T-001");
    expect(t001Child).toBeDefined();

    // Child should have Jira data fetched (not null like before)
    expect(t001Child!.jiraKey).toBe("PROJ-101");
    expect(t001Child!.jiraStatus).toBe("In Review");

    // Child should detect drift (in-progress → review)
    expect(t001Child!.statusDrift).toBe(true);
    expect(t001Child!.proposedMarvinStatus).toBe("review");

    // Child should have linked issues (traverseLinks always on)
    expect(t001Child!.linkedIssues.some((l) => l.key === "PROJ-302")).toBe(true);
  });

  it("resolves sprint and parent from tags/frontmatter", async () => {
    const mockClient = createMockJiraClient();
    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
    });

    expect(report.sprint).toBe("SP-001");
    expect(report.parent).toBe("A-001");
  });

  it("builds contextual signals", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });

    // Test blocked artifact with resolved blocker
    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-002",
    });

    // T-002 is blocked, PROJ-303 (blocker) is Done → unblock signal
    expect(report.signals.some((s) => s.includes("Unblocked"))).toBe(true);
    // PROJ-304 is "Wont Do" → superseded signal
    expect(report.signals.some((s) => s.includes("Superseded"))).toBe(true);
  });

  it("proposes unblock when all blockers are resolved", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-002",
    });

    const unblockUpdate = report.proposedUpdates.find(
      (u) => u.field === "status" && u.reason.includes("blocking issues resolved"),
    );
    expect(unblockUpdate).toBeDefined();
    expect(unblockUpdate!.proposedValue).toBe("in-progress");
  });

  it("applies updates when applyUpdates=true", async () => {
    const mockClient = createMockJiraClient({ withLinks: true });
    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
      applyUpdates: true,
    });

    expect(report.appliedUpdates.length).toBeGreaterThan(0);
    expect(report.proposedUpdates).toHaveLength(0);

    const t001 = store.get("T-001");
    expect(t001?.frontmatter.status).toBe("review");
  });

  it("works for artifact without Jira key", async () => {
    // Add a task with no Jira key
    const docsDir = path.join(marvinDir, "docs");
    fs.writeFileSync(
      path.join(docsDir, "tasks", "T-010.md"),
      `---
id: T-010
title: Local only task
type: task
status: in-progress
progress: 50
created: "2026-03-11T00:00:00Z"
updated: "2026-03-14T00:00:00Z"
tags:
  - sprint:SP-001
---
No Jira link.
`,
    );
    const newStore = new DocumentStore(marvinDir, [
      { type: "sprint", dirName: "sprints", idPrefix: "SP" },
      { type: "task", dirName: "tasks", idPrefix: "T" },
    ]);

    const mockClient = createMockJiraClient();
    const report = await assessArtifact(newStore, mockClient, "jira.example.com", {
      artifactId: "T-010",
    });

    expect(report.jiraKey).toBeNull();
    expect(report.jiraStatus).toBeNull();
    expect(report.statusDrift).toBe(false);
    expect(report.errors).toHaveLength(0);
  });
});

describe("formatArtifactReport", () => {
  it("formats a basic artifact report", () => {
    const report: ArtifactAssessmentReport = {
      artifactId: "T-063",
      title: "Show Planner Group description",
      type: "task",
      marvinStatus: "backlog",
      marvinProgress: 0,
      sprint: "SP-009",
      parent: "A-151",
      jiraKey: "MCB1-277",
      jiraStatus: "Done",
      jiraAssignee: "Alvaro",
      jiraSubtaskProgress: null,
      proposedMarvinStatus: "done",
      statusDrift: true,
      progressDrift: false,
      commentSignals: [],
      commentSummary: "S/4 setup completed on Gamma. No blockers.",
      commentAnalysisProgress: null,
      linkedIssues: [
        {
          key: "MCB1-293",
          summary: "Setup Planner Groups API",
          status: "Done",
          relationship: "implements",
          isDone: true,
        },
      ],
      linkedIssueSignals: [],
      children: [],
      proposedUpdates: [
        {
          artifactId: "T-063",
          field: "status",
          currentValue: "backlog",
          proposedValue: "done",
          reason: 'Jira MCB1-277 is "Done"',
        },
        {
          artifactId: "T-063",
          field: "progress",
          currentValue: 0,
          proposedValue: 100,
          reason: 'Status changing to "done"',
        },
      ],
      appliedUpdates: [],
      signals: ["✅ No active blockers or concerns detected"],
      errors: [],
    };

    const text = formatArtifactReport(report);
    expect(text).toContain("Artifact Assessment — T-063");
    expect(text).toContain("Status: backlog");
    expect(text).toContain("Sprint: SP-009");
    expect(text).toContain("Parent: A-151");
    expect(text).toContain("Jira State (MCB1-277)");
    expect(text).toContain("Assignee: Alvaro");
    expect(text).toContain("Drift: backlog → done");
    expect(text).toContain("S/4 setup completed");
    expect(text).toContain("Linked Issues (1)");
    expect(text).toContain('implements MCB1-293 "Setup Planner Groups API" [Done] ✓');
    expect(text).toContain("Proposed Updates (2)");
    expect(text).toContain("applyUpdates=true");
  });

  it("renders children with progress bar", () => {
    const report: ArtifactAssessmentReport = {
      artifactId: "A-001",
      title: "Build user auth",
      type: "action",
      marvinStatus: "in-progress",
      marvinProgress: 50,
      sprint: "SP-001",
      parent: null,
      jiraKey: null,
      jiraStatus: null,
      jiraAssignee: null,
      jiraSubtaskProgress: null,
      proposedMarvinStatus: null,
      statusDrift: false,
      progressDrift: false,
      commentSignals: [],
      commentSummary: null,
      commentAnalysisProgress: null,
      linkedIssues: [],
      linkedIssueSignals: [],
      children: [
        makeArtifactReport({
          artifactId: "T-001",
          title: "JWT tokens",
          marvinStatus: "done",
          marvinProgress: 100,
          jiraKey: "PROJ-101",
        }),
        makeArtifactReport({
          artifactId: "T-002",
          title: "DB migration",
          marvinStatus: "blocked",
          marvinProgress: 30,
          jiraKey: "PROJ-102",
        }),
      ],
      proposedUpdates: [],
      appliedUpdates: [],
      signals: ["✅ No active blockers or concerns detected"],
      errors: [],
    };

    const text = formatArtifactReport(report);
    expect(text).toContain("Children (1/2 done)");
    expect(text).toContain("█"); // progress bar
    expect(text).toContain("✓ T-001");
    expect(text).toContain("🚫 T-002");
  });

  it("renders signals section", () => {
    const report: ArtifactAssessmentReport = {
      artifactId: "T-002",
      title: "DB migration",
      type: "task",
      marvinStatus: "blocked",
      marvinProgress: 30,
      sprint: "SP-001",
      parent: null,
      jiraKey: "PROJ-102",
      jiraStatus: "Blocked",
      jiraAssignee: null,
      jiraSubtaskProgress: null,
      proposedMarvinStatus: "in-progress",
      statusDrift: true,
      progressDrift: false,
      commentSignals: [],
      commentSummary: null,
      commentAnalysisProgress: null,
      linkedIssues: [],
      linkedIssueSignals: [],
      children: [],
      proposedUpdates: [],
      appliedUpdates: [],
      signals: [
        "✅ Unblocked — all blocking issues resolved: PROJ-303",
        '🔄 Superseded — PROJ-304 "Cancelled feature" is Wont Do',
      ],
      errors: [],
    };

    const text = formatArtifactReport(report);
    expect(text).toContain("## Signals");
    expect(text).toContain("✅ Unblocked");
    expect(text).toContain("🔄 Superseded");
  });
});

// ========================================================================
// parseCommentAnalysis tests
// ========================================================================

describe("parseCommentAnalysis", () => {
  it("parses valid JSON with summary and progressEstimate", () => {
    const result = parseCommentAnalysis('{"summary": "Work done.", "progressEstimate": 75}');
    expect(result.summary).toBe("Work done.");
    expect(result.progressEstimate).toBe(75);
  });

  it("rounds non-integer progressEstimate", () => {
    const result = parseCommentAnalysis('{"summary": "Half done.", "progressEstimate": 66.7}');
    expect(result.progressEstimate).toBe(67);
  });

  it("returns null for negative progressEstimate", () => {
    const result = parseCommentAnalysis('{"summary": "Bad value.", "progressEstimate": -10}');
    expect(result.summary).toBe("Bad value.");
    expect(result.progressEstimate).toBeNull();
  });

  it("returns null for progressEstimate > 100", () => {
    const result = parseCommentAnalysis('{"summary": "Over.", "progressEstimate": 150}');
    expect(result.progressEstimate).toBeNull();
  });

  it("returns null for non-numeric progressEstimate", () => {
    const result = parseCommentAnalysis('{"summary": "Text.", "progressEstimate": "high"}');
    expect(result.progressEstimate).toBeNull();
  });

  it("handles null progressEstimate in JSON", () => {
    const result = parseCommentAnalysis('{"summary": "No estimate.", "progressEstimate": null}');
    expect(result.summary).toBe("No estimate.");
    expect(result.progressEstimate).toBeNull();
  });

  it("falls back to text summary when JSON is invalid", () => {
    const result = parseCommentAnalysis("This is just a plain text summary.");
    expect(result.summary).toBe("This is just a plain text summary.");
    expect(result.progressEstimate).toBeNull();
  });

  it("extracts percentage from fallback text", () => {
    const result = parseCommentAnalysis("About 80% of the work is done.");
    expect(result.summary).toBe("About 80% of the work is done.");
    expect(result.progressEstimate).toBe(80);
  });

  it("ignores percentage > 100 in fallback text", () => {
    const result = parseCommentAnalysis("This took 200% more effort than expected.");
    expect(result.progressEstimate).toBeNull();
  });

  it("handles JSON wrapped in markdown code block", () => {
    const result = parseCommentAnalysis(
      '```json\n{"summary": "Wrapped.", "progressEstimate": 50}\n```',
    );
    expect(result.summary).toBe("Wrapped.");
    expect(result.progressEstimate).toBe(50);
  });

  it("handles missing summary field in JSON", () => {
    const result = parseCommentAnalysis('{"progressEstimate": 30}');
    // Falls back to text mode since summary is missing — no % in text, so no extraction
    expect(result.summary).toBe('{"progressEstimate": 30}');
    expect(result.progressEstimate).toBeNull();
  });
});

// ========================================================================
// buildAssessmentSummary tests
// ========================================================================

describe("buildAssessmentSummary", () => {
  it("builds summary with no children", () => {
    const result = buildAssessmentSummary("All good.", 80, ["✅ No blockers"], [], []);
    expect(result.commentSummary).toBe("All good.");
    expect(result.commentAnalysisProgress).toBe(80);
    expect(result.signals).toEqual(["✅ No blockers"]);
    expect(result.childCount).toBe(0);
    expect(result.childDoneCount).toBe(0);
    expect(result.childRollupProgress).toBeNull();
    expect(result.linkedIssueCount).toBe(0);
    expect(result.generatedAt).toBeTruthy();
  });

  it("computes rollup from children using marvinProgress", () => {
    const children = [
      makeArtifactReport({ artifactId: "T-001", marvinStatus: "done", marvinProgress: 100 }),
      makeArtifactReport({ artifactId: "T-002", marvinStatus: "in-progress", marvinProgress: 50 }),
    ];
    const result = buildAssessmentSummary(null, null, [], children, []);
    expect(result.childCount).toBe(2);
    expect(result.childDoneCount).toBe(1);
    expect(result.childRollupProgress).toBe(75); // (100+50)/2
  });

  it("uses post-update progress from appliedUpdates", () => {
    const children = [
      makeArtifactReport({
        artifactId: "T-001",
        marvinStatus: "in-progress",
        marvinProgress: 40,
        appliedUpdates: [
          {
            artifactId: "T-001",
            field: "status",
            currentValue: "in-progress",
            proposedValue: "done",
            reason: "test",
          },
        ],
      }),
      makeArtifactReport({ artifactId: "T-002", marvinStatus: "in-progress", marvinProgress: 60 }),
    ];
    const result = buildAssessmentSummary(null, null, [], children, []);
    // T-001: applied status=done → 100, T-002: marvinProgress=60
    expect(result.childRollupProgress).toBe(80); // (100+60)/2
    expect(result.childDoneCount).toBe(1);
  });

  it("uses post-update progress value over marvinProgress", () => {
    const children = [
      makeArtifactReport({
        artifactId: "T-001",
        marvinProgress: 20,
        appliedUpdates: [
          {
            artifactId: "T-001",
            field: "progress",
            currentValue: 20,
            proposedValue: 90,
            reason: "test",
          },
        ],
      }),
    ];
    const result = buildAssessmentSummary(null, null, [], children, []);
    expect(result.childRollupProgress).toBe(90);
  });

  it("all children complete", () => {
    const children = [
      makeArtifactReport({ artifactId: "T-001", marvinStatus: "done", marvinProgress: 100 }),
      makeArtifactReport({ artifactId: "T-002", marvinStatus: "done", marvinProgress: 100 }),
      makeArtifactReport({ artifactId: "T-003", marvinStatus: "done", marvinProgress: 100 }),
    ];
    const result = buildAssessmentSummary(null, null, [], children, []);
    expect(result.childDoneCount).toBe(3);
    expect(result.childRollupProgress).toBe(100);
  });

  it("counts linked issues", () => {
    const linkedIssues = [
      { key: "PROJ-1", summary: "A", status: "Done", relationship: "blocks", isDone: true },
      { key: "PROJ-2", summary: "B", status: "Open", relationship: "relates to", isDone: false },
    ];
    const result = buildAssessmentSummary(null, null, [], [], linkedIssues);
    expect(result.linkedIssueCount).toBe(2);
  });

  it("includes blocker progress fields", () => {
    const result = buildAssessmentSummary(null, null, [], [], [], 15, 2, 1);
    expect(result.blockerProgress).toBe(15);
    expect(result.totalBlockers).toBe(2);
    expect(result.resolvedBlockers).toBe(1);
  });

  it("defaults blocker progress fields when not provided", () => {
    const result = buildAssessmentSummary(null, null, [], [], []);
    expect(result.blockerProgress).toBeNull();
    expect(result.totalBlockers).toBe(0);
    expect(result.resolvedBlockers).toBe(0);
  });
});

// ========================================================================
// computeBlockerProgress
// ========================================================================

describe("computeBlockerProgress", () => {
  it("returns null when there are no blockers", () => {
    const links = [
      { key: "PROJ-1", summary: "A", status: "Open", relationship: "relates to", isDone: false },
    ];
    expect(computeBlockerProgress(links, 0.3)).toBeNull();
  });

  it("returns null for empty linked issues", () => {
    expect(computeBlockerProgress([], 0.3)).toBeNull();
  });

  it("computes partial blocker resolution", () => {
    const links = [
      { key: "PROJ-1", summary: "A", status: "Done", relationship: "is blocked by", isDone: true },
      {
        key: "PROJ-2",
        summary: "B",
        status: "In Progress",
        relationship: "is blocked by",
        isDone: false,
      },
    ];
    const result = computeBlockerProgress(links, 0.3);
    expect(result).not.toBeNull();
    expect(result!.totalBlockers).toBe(2);
    expect(result!.resolvedBlockers).toBe(1);
    // (1/2) * 0.3 * 100 = 15
    expect(result!.blockerProgress).toBe(15);
  });

  it("computes full blocker resolution", () => {
    const links = [
      { key: "PROJ-1", summary: "A", status: "Done", relationship: "blocks", isDone: true },
      { key: "PROJ-2", summary: "B", status: "Closed", relationship: "blocks", isDone: true },
    ];
    const result = computeBlockerProgress(links, 0.3);
    expect(result).not.toBeNull();
    expect(result!.resolvedBlockers).toBe(2);
    // (2/2) * 0.3 * 100 = 30
    expect(result!.blockerProgress).toBe(30);
  });

  it("counts Won't Do as resolved", () => {
    const links = [
      {
        key: "PROJ-1",
        summary: "A",
        status: "Won't Do",
        relationship: "is blocked by",
        isDone: true,
      },
      { key: "PROJ-2", summary: "B", status: "Open", relationship: "is blocked by", isDone: false },
    ];
    const result = computeBlockerProgress(links, 0.3);
    expect(result!.resolvedBlockers).toBe(1);
    expect(result!.blockerProgress).toBe(15);
  });

  it("respects custom prerequisiteWeight", () => {
    const links = [
      { key: "PROJ-1", summary: "A", status: "Done", relationship: "is blocked by", isDone: true },
      { key: "PROJ-2", summary: "B", status: "Open", relationship: "is blocked by", isDone: false },
    ];
    // (1/2) * 0.5 * 100 = 25
    const result = computeBlockerProgress(links, 0.5);
    expect(result!.blockerProgress).toBe(25);
  });

  it("ignores non-blocker relationships", () => {
    const links = [
      { key: "PROJ-1", summary: "A", status: "Done", relationship: "relates to", isDone: true },
      { key: "PROJ-2", summary: "B", status: "Done", relationship: "is blocked by", isDone: true },
    ];
    const result = computeBlockerProgress(links, 0.3);
    expect(result!.totalBlockers).toBe(1);
    expect(result!.resolvedBlockers).toBe(1);
    expect(result!.blockerProgress).toBe(30);
  });
});

// ========================================================================
// formatArtifactReport — blocker resolution section
// ========================================================================

describe("formatArtifactReport — blocker resolution", () => {
  it("shows blocker resolution section when blockers exist", () => {
    const report = makeArtifactReport({
      totalBlockers: 4,
      resolvedBlockers: 2,
      blockerProgress: 15,
    });
    const output = formatArtifactReport(report);
    expect(output).toContain("## Blocker Resolution");
    expect(output).toContain("2/4 blockers resolved");
    expect(output).toContain("15%");
  });

  it("omits blocker resolution section when no blockers", () => {
    const report = makeArtifactReport({ totalBlockers: 0 });
    const output = formatArtifactReport(report);
    expect(output).not.toContain("## Blocker Resolution");
  });

  it("shows n/a when blockerProgress is null (skipped)", () => {
    const report = makeArtifactReport({
      totalBlockers: 2,
      resolvedBlockers: 1,
      blockerProgress: null,
    });
    const output = formatArtifactReport(report);
    expect(output).toContain("n/a (skipped)");
  });
});

// ========================================================================
// Comment-derived progress proposals
// ========================================================================

describe("assessArtifact — comment-derived progress proposals", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-progress-diverge-"));
    marvinDir = path.join(tmpDir, ".marvin");
    store = setupStore(marvinDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function mockLlmProgressEstimate(
    progressEstimate: number,
    summary = "Progress update from comments.",
  ) {
    const { query } = vi.mocked(await import("@anthropic-ai/claude-agent-sdk"));
    (query as ReturnType<typeof vi.fn>).mockReturnValue(
      (async function* () {
        yield {
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ summary, progressEstimate }),
              },
            ],
          },
        };
      })(),
    );
  }

  it("proposes progress update when comment-derived estimate diverges by >= threshold", async () => {
    // T-001 has progress: 50, mock LLM returns 90% → divergence = 40pp > default 15pp
    await mockLlmProgressEstimate(90);

    const mockClient = createMockJiraClient({ withLinks: true });
    // Add comments so LLM analysis triggers
    const originalGetComments = mockClient.getComments.bind(mockClient);
    (mockClient as any).getComments = vi.fn(async (key: string) => {
      if (key === "PROJ-101") {
        return [
          {
            id: "1",
            author: { displayName: "Dev" },
            created: "2026-03-14T10:00:00Z",
            body: "Almost done with the implementation.",
          },
        ];
      }
      return originalGetComments(key);
    });

    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
    });

    const progressUpdate = report.proposedUpdates.find(
      (u) => u.field === "progress" && u.reason.includes("Comment-derived estimate"),
    );
    expect(progressUpdate).toBeDefined();
    expect(progressUpdate!.proposedValue).toBe(90);
    expect(progressUpdate!.reason).toContain("diverges from current");
    expect(progressUpdate!.reason).toContain("40pp");
  });

  it("does not propose progress update when divergence is below threshold", async () => {
    // T-001 has progress: 50, mock LLM returns 55% → divergence = 5pp < 15pp
    await mockLlmProgressEstimate(55);

    const mockClient = createMockJiraClient({ withLinks: true });
    (mockClient as any).getComments = vi.fn(async (key: string) => {
      if (key === "PROJ-101") {
        return [
          {
            id: "1",
            author: { displayName: "Dev" },
            created: "2026-03-14T10:00:00Z",
            body: "Minor progress.",
          },
        ];
      }
      return [];
    });

    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
    });

    const progressUpdate = report.proposedUpdates.find(
      (u) => u.field === "progress" && u.reason.includes("Comment-derived estimate"),
    );
    expect(progressUpdate).toBeUndefined();
  });

  it("respects custom progressDivergenceThreshold", async () => {
    // T-001 has progress: 50, mock LLM returns 55% → divergence = 5pp
    // With threshold=5, this should trigger
    await mockLlmProgressEstimate(55);

    const mockClient = createMockJiraClient({ withLinks: true });
    (mockClient as any).getComments = vi.fn(async (key: string) => {
      if (key === "PROJ-101") {
        return [
          {
            id: "1",
            author: { displayName: "Dev" },
            created: "2026-03-14T10:00:00Z",
            body: "Minor progress.",
          },
        ];
      }
      return [];
    });

    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
      progressDivergenceThreshold: 5,
    });

    const progressUpdate = report.proposedUpdates.find(
      (u) => u.field === "progress" && u.reason.includes("Comment-derived estimate"),
    );
    expect(progressUpdate).toBeDefined();
    expect(progressUpdate!.proposedValue).toBe(55);
  });

  it("warns about progressOverride but still proposes update", async () => {
    // Create a task with progressOverride: true
    const docsDir = path.join(marvinDir, "docs");
    fs.writeFileSync(
      path.join(docsDir, "tasks", "T-020.md"),
      `---
id: T-020
title: Locked progress task
type: task
status: in-progress
progress: 5
progressOverride: true
created: "2026-03-11T00:00:00Z"
updated: "2026-03-14T00:00:00Z"
jiraKey: PROJ-101
tags:
  - sprint:SP-001
---
Locked progress.
`,
    );
    const newStore = new DocumentStore(marvinDir, [
      { type: "sprint", dirName: "sprints", idPrefix: "SP" },
      { type: "task", dirName: "tasks", idPrefix: "T" },
    ]);

    await mockLlmProgressEstimate(90);

    const mockClient = createMockJiraClient({ withLinks: true });
    (mockClient as any).getComments = vi.fn(async (key: string) => {
      if (key === "PROJ-101") {
        return [
          {
            id: "1",
            author: { displayName: "Dev" },
            created: "2026-03-14T10:00:00Z",
            body: "Almost done.",
          },
        ];
      }
      return [];
    });

    const report = await assessArtifact(newStore, mockClient, "jira.example.com", {
      artifactId: "T-020",
    });

    const progressUpdate = report.proposedUpdates.find(
      (u) => u.field === "progress" && u.reason.includes("Comment-derived estimate"),
    );
    expect(progressUpdate).toBeDefined();
    expect(progressUpdate!.reason).toContain("progressOverride is set");
    expect(progressUpdate!.proposedValue).toBe(90);
  });

  it("proposes downward progress correction when estimate is lower", async () => {
    // T-001 has progress: 50, mock LLM returns 20% → divergence = 30pp
    await mockLlmProgressEstimate(20);

    const mockClient = createMockJiraClient({ withLinks: true });
    (mockClient as any).getComments = vi.fn(async (key: string) => {
      if (key === "PROJ-101") {
        return [
          {
            id: "1",
            author: { displayName: "Dev" },
            created: "2026-03-14T10:00:00Z",
            body: "Realized scope is much larger.",
          },
        ];
      }
      return [];
    });

    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
    });

    const progressUpdate = report.proposedUpdates.find(
      (u) => u.field === "progress" && u.reason.includes("Comment-derived estimate"),
    );
    expect(progressUpdate).toBeDefined();
    expect(progressUpdate!.currentValue).toBe(50);
    expect(progressUpdate!.proposedValue).toBe(20);
    expect(progressUpdate!.reason).toContain("30pp");
  });

  it("does not propose when no comment-derived estimate is available", async () => {
    // LLM returns no progress estimate
    const { query } = vi.mocked(await import("@anthropic-ai/claude-agent-sdk"));
    (query as ReturnType<typeof vi.fn>).mockReturnValue(
      (async function* () {
        yield {
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ summary: "No estimate available.", progressEstimate: null }),
              },
            ],
          },
        };
      })(),
    );

    const mockClient = createMockJiraClient({ withLinks: true });
    (mockClient as any).getComments = vi.fn(async (key: string) => {
      if (key === "PROJ-101") {
        return [
          {
            id: "1",
            author: { displayName: "Dev" },
            created: "2026-03-14T10:00:00Z",
            body: "Update.",
          },
        ];
      }
      return [];
    });

    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
    });

    const progressUpdate = report.proposedUpdates.find(
      (u) => u.field === "progress" && u.reason.includes("Comment-derived estimate"),
    );
    expect(progressUpdate).toBeUndefined();
  });

  it("does not propose no-op update when estimate equals current progress with threshold=0", async () => {
    // T-001 has progress: 50, mock LLM returns 50% → divergence = 0
    // Even with threshold=0, no update should be proposed since the value hasn't changed
    await mockLlmProgressEstimate(50);

    const mockClient = createMockJiraClient({ withLinks: true });
    (mockClient as any).getComments = vi.fn(async (key: string) => {
      if (key === "PROJ-101") {
        return [
          {
            id: "1",
            author: { displayName: "Dev" },
            created: "2026-03-14T10:00:00Z",
            body: "Status check.",
          },
        ];
      }
      return [];
    });

    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
      progressDivergenceThreshold: 0,
    });

    const progressUpdate = report.proposedUpdates.find(
      (u) => u.field === "progress" && u.reason.includes("Comment-derived estimate"),
    );
    expect(progressUpdate).toBeUndefined();
  });

  it("applies comment-derived progress update when applyUpdates=true", async () => {
    await mockLlmProgressEstimate(90);

    const mockClient = createMockJiraClient({ withLinks: true });
    (mockClient as any).getComments = vi.fn(async (key: string) => {
      if (key === "PROJ-101") {
        return [
          {
            id: "1",
            author: { displayName: "Dev" },
            created: "2026-03-14T10:00:00Z",
            body: "Nearly done.",
          },
        ];
      }
      return [];
    });

    const report = await assessArtifact(store, mockClient, "jira.example.com", {
      artifactId: "T-001",
      applyUpdates: true,
    });

    // Should be in appliedUpdates, not proposedUpdates
    expect(report.proposedUpdates).toHaveLength(0);
    // May be replaced by dependency-weighted progress; check either way
    expect(report.appliedUpdates.some((u) => u.field === "progress")).toBe(true);
  });
});

// ========================================================================
// formatArtifactReport — comment-derived progress proposals
// ========================================================================

describe("formatArtifactReport — comment-derived progress proposals", () => {
  it("shows comment-derived progress proposal with divergence reason", () => {
    const report = makeArtifactReport({
      artifactId: "T-067",
      marvinProgress: 5,
      proposedUpdates: [
        {
          artifactId: "T-067",
          field: "progress",
          currentValue: 5,
          proposedValue: 90,
          reason: "Comment-derived estimate (90%) diverges from current (5%) by 85pp",
        },
      ],
    });
    const output = formatArtifactReport(report);
    expect(output).toContain("T-067.progress: 5 → 90");
    expect(output).toContain("Comment-derived estimate (90%) diverges from current (5%) by 85pp");
  });

  it("shows progressOverride warning in proposal", () => {
    const report = makeArtifactReport({
      artifactId: "T-067",
      marvinProgress: 5,
      proposedUpdates: [
        {
          artifactId: "T-067",
          field: "progress",
          currentValue: 5,
          proposedValue: 90,
          reason:
            "Comment-derived estimate (90%) diverges from current (5%) by 85pp ⚠ progressOverride is set — review before applying",
        },
      ],
    });
    const output = formatArtifactReport(report);
    expect(output).toContain("progressOverride is set");
  });

  it("shows both status and progress proposals together", () => {
    const report = makeArtifactReport({
      artifactId: "T-067",
      marvinStatus: "ready",
      marvinProgress: 5,
      statusDrift: true,
      proposedMarvinStatus: "review",
      jiraKey: "MCB1-291",
      jiraStatus: "REVIEWING",
      proposedUpdates: [
        {
          artifactId: "T-067",
          field: "status",
          currentValue: "ready",
          proposedValue: "review",
          reason: 'Jira MCB1-291 is "REVIEWING" → maps to "review"',
        },
        {
          artifactId: "T-067",
          field: "progress",
          currentValue: 5,
          proposedValue: 90,
          reason: "Comment-derived estimate (90%) diverges from current (5%) by 85pp",
        },
      ],
    });
    const output = formatArtifactReport(report);
    expect(output).toContain("## Proposed Updates (2)");
    expect(output).toContain("T-067.status: ready → review");
    expect(output).toContain("T-067.progress: 5 → 90");
  });
});
