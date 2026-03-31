import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import {
  extractCommentText,
  detectCommentSignals,
  tokenize,
  computeTitleSimilarity,
  findLinkSuggestions,
  fetchJiraDaily,
  type DateRange,
} from "../../../src/skills/builtin/jira/daily.js";
import type { JiraClient } from "../../../src/skills/builtin/jira/client.js";

describe("extractCommentText", () => {
  it("should return string bodies as-is", () => {
    expect(extractCommentText("Hello world")).toBe("Hello world");
  });

  it("should extract text from ADF format", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
        },
      ],
    };
    expect(extractCommentText(adf)).toBe("Hello  world");
  });

  it("should handle nested ADF", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item 1" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(extractCommentText(adf)).toBe("Item 1");
  });

  it("should return empty string for null/undefined", () => {
    expect(extractCommentText(null)).toBe("");
    expect(extractCommentText(undefined)).toBe("");
  });
});

describe("detectCommentSignals", () => {
  it("should detect blocker signals", () => {
    const signals = detectCommentSignals("We're blocked waiting for Nick's approval");
    expect(signals.some((s) => s.type === "blocker")).toBe(true);
  });

  it("should detect decision signals", () => {
    const signals = detectCommentSignals("We decided to go with the second approach");
    expect(signals.some((s) => s.type === "decision")).toBe(true);
  });

  it("should detect question signals", () => {
    const signals = detectCommentSignals("How should we handle the edge case?");
    expect(signals.some((s) => s.type === "question")).toBe(true);
  });

  it("should detect resolution signals", () => {
    const signals = detectCommentSignals("Fixed and deployed to production");
    expect(signals.some((s) => s.type === "resolution")).toBe(true);
  });

  it("should detect multiple signal types", () => {
    const signals = detectCommentSignals(
      "We're blocked on the API.\nShould we use the workaround?\nAgreed to proceed with plan B.",
    );
    const types = signals.map((s) => s.type);
    expect(types).toContain("blocker");
    expect(types).toContain("question");
    expect(types).toContain("decision");
  });

  it("should deduplicate by type", () => {
    const signals = detectCommentSignals("Is this done? What about this? Any ideas?");
    const questions = signals.filter((s) => s.type === "question");
    expect(questions).toHaveLength(1);
  });

  it("should return empty for plain text without signals", () => {
    const signals = detectCommentSignals("Updated the documentation with the latest changes");
    // "Updated" doesn't match any pattern
    expect(signals).toHaveLength(0);
  });

  it("should detect 'on hold' as blocker", () => {
    const signals = detectCommentSignals("We're on hold until Nick approves the mockup");
    expect(signals.some((s) => s.type === "blocker")).toBe(true);
  });
});

describe("tokenize", () => {
  it("should lowercase and split", () => {
    const tokens = tokenize("Budget Planning Landing Page");
    expect(tokens.has("budget")).toBe(true);
    expect(tokens.has("planning")).toBe(true);
    expect(tokens.has("landing")).toBe(true);
    expect(tokens.has("page")).toBe(true);
  });

  it("should remove stopwords", () => {
    const tokens = tokenize("Define the API for the service");
    expect(tokens.has("the")).toBe(false);
    expect(tokens.has("for")).toBe(false);
    expect(tokens.has("define")).toBe(true);
    expect(tokens.has("api")).toBe(true);
    expect(tokens.has("service")).toBe(true);
  });

  it("should filter short words", () => {
    const tokens = tokenize("UI is OK");
    expect(tokens.has("is")).toBe(false);
    expect(tokens.has("ok")).toBe(false); // 2 chars
  });
});

describe("computeTitleSimilarity", () => {
  it("should return high score for similar titles", () => {
    const { score, sharedTerms } = computeTitleSimilarity(
      "Implement Budget Planning Landing Page",
      "PoC: Budget Planning Landing Page — planner's cost center budget list",
    );
    expect(score).toBeGreaterThan(0.2);
    expect(sharedTerms).toContain("budget");
    expect(sharedTerms).toContain("planning");
    expect(sharedTerms).toContain("landing");
  });

  it("should return 0 for completely different titles", () => {
    const { score } = computeTitleSimilarity(
      "Fix CI pipeline",
      "Define anomaly detection rules catalog",
    );
    expect(score).toBe(0);
  });

  it("should return 0 for empty strings", () => {
    const { score } = computeTitleSimilarity("", "Something");
    expect(score).toBe(0);
  });
});

describe("findLinkSuggestions", () => {
  it("should find matching artifacts", () => {
    const docs = [
      {
        frontmatter: {
          id: "T-001",
          type: "task",
          title: "Define anomaly detection rules catalog for V1",
        },
      },
      { frontmatter: { id: "T-002", type: "task", title: "Setup CI pipeline" } },
      {
        frontmatter: { id: "A-001", type: "action", title: "Budget planning page implementation" },
      },
    ];
    const suggestions = findLinkSuggestions(
      "Define Planning-phase Anomaly Detection UX Integration",
      docs,
    );
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].artifactId).toBe("T-001");
  });

  it("should skip artifacts that already have a jiraKey", () => {
    const docs = [
      {
        frontmatter: {
          id: "T-001",
          type: "task",
          title: "Anomaly detection rules",
          jiraKey: "MCB1-100",
        },
      },
    ];
    const suggestions = findLinkSuggestions("Anomaly detection rules catalog", docs);
    expect(suggestions).toHaveLength(0);
  });

  it("should return at most 3 suggestions", () => {
    const docs = Array.from({ length: 10 }, (_, i) => ({
      frontmatter: {
        id: `T-${i + 1}`,
        type: "task",
        title: `Budget planning variant ${i + 1} implementation`,
      },
    }));
    const suggestions = findLinkSuggestions("Budget planning implementation", docs);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });
});

describe("fetchJiraDaily", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let mockClient: JiraClient;

  const TASK_REG = { type: "task", dirName: "tasks", idPrefix: "T" };
  const dateRange: DateRange = { from: "2026-03-23", to: "2026-03-23" };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-jira-daily-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs"), { recursive: true });
    store = new DocumentStore(marvinDir, [TASK_REG]);

    mockClient = {
      searchIssuesV3: vi.fn().mockResolvedValue({ total: 0, issues: [] }),
      getChangelog: vi.fn().mockResolvedValue([]),
      getComments: vi.fn().mockResolvedValue([]),
      getRemoteLinks: vi.fn().mockResolvedValue([]),
      getIssueWithLinks: vi.fn().mockResolvedValue(null),
    } as unknown as JiraClient;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return empty summary when no issues updated", async () => {
    const result = await fetchJiraDaily(store, mockClient, "test.atlassian.net", "PROJ", dateRange);
    expect(result.issues).toHaveLength(0);
    expect(result.proposedActions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("should handle search errors gracefully", async () => {
    vi.mocked(mockClient.searchIssuesV3).mockRejectedValue(new Error("API error"));

    const result = await fetchJiraDaily(store, mockClient, "test.atlassian.net", "PROJ", dateRange);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Search failed");
  });

  it("should cross-reference with Marvin artifacts", async () => {
    store.create(
      "action",
      {
        title: "Test Action",
        status: "open",
        jiraKey: "PROJ-1",
      } as any,
      "",
    );

    vi.mocked(mockClient.searchIssuesV3).mockResolvedValue({
      total: 1,
      startAt: 0,
      maxResults: 100,
      issues: [
        {
          key: "PROJ-1",
          id: "1",
          self: "",
          fields: {
            summary: "Test issue",
            description: null,
            status: { name: "In Progress" },
            issuetype: { name: "Task" },
            priority: null,
            assignee: null,
            labels: [],
            created: "2026-03-23T00:00:00Z",
            updated: "2026-03-23T10:00:00Z",
          },
        },
      ],
    });

    const result = await fetchJiraDaily(store, mockClient, "test.atlassian.net", "PROJ", dateRange);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].marvinArtifacts).toHaveLength(1);
    expect(result.issues[0].marvinArtifacts[0].id).toBe("A-001");
    expect(result.issues[0].marvinArtifacts[0].statusDrift).toBe(true);
  });

  it("should propose status-update for drifted artifacts", async () => {
    store.create(
      "action",
      {
        title: "Drifted Action",
        status: "open",
        jiraKey: "PROJ-2",
      } as any,
      "",
    );

    vi.mocked(mockClient.searchIssuesV3).mockResolvedValue({
      total: 1,
      startAt: 0,
      maxResults: 100,
      issues: [
        {
          key: "PROJ-2",
          id: "2",
          self: "",
          fields: {
            summary: "Drifted",
            description: null,
            status: { name: "Done" },
            issuetype: { name: "Task" },
            priority: null,
            assignee: null,
            labels: [],
            created: "2026-03-23T00:00:00Z",
            updated: "2026-03-23T10:00:00Z",
          },
        },
      ],
    });

    const result = await fetchJiraDaily(store, mockClient, "test.atlassian.net", "PROJ", dateRange);
    expect(result.proposedActions.length).toBeGreaterThan(0);
    const statusAction = result.proposedActions.find((a) => a.type === "status-update");
    expect(statusAction).toBeDefined();
    expect(statusAction!.artifactId).toBe("A-001");
  });

  it("should propose unlinked-issue for issues without Marvin artifacts", async () => {
    vi.mocked(mockClient.searchIssuesV3).mockResolvedValue({
      total: 1,
      startAt: 0,
      maxResults: 100,
      issues: [
        {
          key: "PROJ-3",
          id: "3",
          self: "",
          fields: {
            summary: "Unlinked issue",
            description: null,
            status: { name: "To Do" },
            issuetype: { name: "Story" },
            priority: null,
            assignee: null,
            labels: [],
            created: "2026-03-23T00:00:00Z",
            updated: "2026-03-23T10:00:00Z",
          },
        },
      ],
    });

    // Add a changelog entry so it counts as "having activity"
    vi.mocked(mockClient.getChangelog).mockResolvedValue([
      {
        id: "1",
        author: { displayName: "Jane" },
        created: "2026-03-23T10:00:00Z",
        items: [
          {
            field: "status",
            fieldtype: "jira",
            from: null,
            fromString: "Backlog",
            to: null,
            toString: "To Do",
          },
        ],
      },
    ]);

    const result = await fetchJiraDaily(store, mockClient, "test.atlassian.net", "PROJ", dateRange);
    const unlinked = result.proposedActions.find((a) => a.type === "unlinked-issue");
    expect(unlinked).toBeDefined();
    expect(unlinked!.jiraKey).toBe("PROJ-3");
  });

  it("should detect Confluence links from remote links", async () => {
    vi.mocked(mockClient.searchIssuesV3).mockResolvedValue({
      total: 1,
      startAt: 0,
      maxResults: 100,
      issues: [
        {
          key: "PROJ-4",
          id: "4",
          self: "",
          fields: {
            summary: "With Confluence",
            description: null,
            status: { name: "To Do" },
            issuetype: { name: "Task" },
            priority: null,
            assignee: null,
            labels: [],
            created: "2026-03-23T00:00:00Z",
            updated: "2026-03-23T10:00:00Z",
          },
        },
      ],
    });

    vi.mocked(mockClient.getRemoteLinks).mockResolvedValue([
      {
        id: 1,
        self: "",
        object: {
          url: "https://myco.atlassian.net/wiki/spaces/PROJ/pages/123/Design+Doc",
          title: "Design Doc",
        },
      },
      {
        id: 2,
        self: "",
        object: {
          url: "https://github.com/repo/pr/1",
          title: "PR #1",
        },
      },
    ]);

    const result = await fetchJiraDaily(store, mockClient, "test.atlassian.net", "PROJ", dateRange);
    expect(result.issues[0].confluenceLinks).toHaveLength(1);
    expect(result.issues[0].confluenceLinks[0].title).toBe("Design Doc");

    const confAction = result.proposedActions.find((a) => a.type === "confluence-review");
    expect(confAction).toBeDefined();
  });
});
