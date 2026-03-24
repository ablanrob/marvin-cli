import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { extractJiraKeyFromTags } from "../../../src/skills/builtin/jira/sync.js";
import {
  assessSprintProgress,
  formatProgressReport,
  type SprintProgressReport,
} from "../../../src/skills/builtin/jira/sprint-progress.js";
import type { JiraClient } from "../../../src/skills/builtin/jira/client.js";

// Mock the LLM query so tests don't call the real API
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
  tool: vi.fn(),
}));

// --- Helper: create a minimal store with sprint + items ---

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

  // Action with jiraKey
  fs.writeFileSync(
    path.join(docsDir, "actions", "A-001.md"),
    `---
id: A-001
title: Build user auth
type: action
status: in-progress
progress: 40
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

  // Action with jira tag only (no jiraKey field)
  fs.writeFileSync(
    path.join(docsDir, "actions", "A-002.md"),
    `---
id: A-002
title: Setup CI pipeline
type: action
status: open
progress: 0
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

  // Task under A-001
  fs.writeFileSync(
    path.join(docsDir, "tasks", "T-001.md"),
    `---
id: T-001
title: Implement JWT tokens
type: task
status: in-progress
progress: 50
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

  // Blocked task
  fs.writeFileSync(
    path.join(docsDir, "tasks", "T-002.md"),
    `---
id: T-002
title: Database migration
type: task
status: blocked
progress: 10
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

// --- Tests ---

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

    // A-002 uses tag-based key jira:PROJ-200
    const a002 = report.itemReports.flatMap(r => [r, ...r.children]).find(r => r.id === "A-002");
    expect(a002?.jiraKey).toBe("PROJ-200");
    expect(a002?.jiraStatus).toBe("To Do");
  });

  it("detects status drift", async () => {
    // T-001 is "in-progress" in Marvin but Jira says "In Review" → maps to "review"
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

    // PROJ-100 has 2 subtasks, 1 done → 50%
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

    // Verify the store was actually updated
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
    // Items without Jira data should still appear
    expect(report.itemReports.length).toBeGreaterThan(0);
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

  it("renders focus areas with progress bars", () => {
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
          items: [{
            id: "A-001",
            title: "Build auth",
            type: "action",
            marvinStatus: "in-progress",
            marvinProgress: 50,
            jiraKey: "PROJ-100",
            jiraStatus: "In Progress",
            jiraSubtaskProgress: 50,
            proposedMarvinStatus: "in-progress",
            statusDrift: false,
            progressDrift: false,
            commentSignals: [],
            commentSummary: null,
            children: [],
            owner: "alice",
            focusArea: "Authentication",
          }],
          totalCount: 1,
          doneCount: 0,
          blockedCount: 0,
          avgProgress: 50,
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
  });

  it("renders drift and blocker sections", () => {
    const driftItem = {
      id: "T-001",
      title: "JWT",
      type: "task",
      marvinStatus: "in-progress",
      marvinProgress: 50,
      jiraKey: "PROJ-101",
      jiraStatus: "In Review",
      jiraSubtaskProgress: null,
      proposedMarvinStatus: "review",
      statusDrift: true,
      progressDrift: false,
      commentSignals: [],
      commentSummary: null,
      children: [],
      owner: null,
      focusArea: null,
    };

    const blockerItem = {
      id: "T-002",
      title: "DB Migration",
      type: "task",
      marvinStatus: "blocked",
      marvinProgress: 10,
      jiraKey: "PROJ-102",
      jiraStatus: "Blocked",
      jiraSubtaskProgress: null,
      proposedMarvinStatus: "blocked",
      statusDrift: false,
      progressDrift: false,
      commentSignals: [{ type: "blocker" as const, snippet: "Waiting for DBA approval" }],
      commentSummary: null,
      children: [],
      owner: null,
      focusArea: null,
    };

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
});
