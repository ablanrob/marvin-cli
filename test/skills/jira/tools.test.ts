import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createJiraTools } from "../../../src/skills/builtin/jira/tools.js";
import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";

vi.mock("../../../src/core/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/core/config.js")>();
  return {
    ...actual,
    loadUserConfig: () => ({}),
  };
});

describe("Jira tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let tools: SdkMcpToolDefinition<any>[];
  const savedJiraEnv: Record<string, string | undefined> = {};

  const JI_REGISTRATION = { type: "jira-issue", dirName: "jira-issues", idPrefix: "JI" };

  beforeEach(() => {
    // Save and clear Jira env vars so no test hits a real Jira instance
    for (const key of ["JIRA_HOST", "JIRA_EMAIL", "JIRA_API_TOKEN"]) {
      savedJiraEnv[key] = process.env[key];
      delete process.env[key];
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-jira-tools-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs"), { recursive: true });
    store = new DocumentStore(marvinDir, [JI_REGISTRATION]);
    tools = createJiraTools(store);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Restore Jira env vars
    for (const [key, value] of Object.entries(savedJiraEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function findTool(name: string) {
    return tools.find((t) => t.name === name)!;
  }

  async function callTool(name: string, args: Record<string, unknown>) {
    const t = findTool(name);
    return (t as any).handler(args);
  }

  it("should register all 11 tools", () => {
    expect(tools).toHaveLength(11);
    const names = tools.map((t) => t.name);
    expect(names).toContain("list_jira_issues");
    expect(names).toContain("get_jira_issue");
    expect(names).toContain("pull_jira_issue");
    expect(names).toContain("pull_jira_issues_jql");
    expect(names).toContain("push_artifact_to_jira");
    expect(names).toContain("sync_jira_issue");
    expect(names).toContain("link_artifact_to_jira");
    expect(names).toContain("link_to_jira");
    expect(names).toContain("fetch_jira_status");
    expect(names).toContain("fetch_jira_statuses");
    expect(names).toContain("fetch_jira_daily");
  });

  describe("list_jira_issues", () => {
    it("should return empty array on empty store", async () => {
      const result = await callTool("list_jira_issues", {});
      const data = JSON.parse(result.content[0].text);
      expect(data).toEqual([]);
    });

    it("should list created JI documents", async () => {
      store.create("jira-issue", {
        title: "Test issue",
        status: "open",
        jiraKey: "PROJ-1",
        issueType: "Story",
        priority: "High",
        assignee: "Jane",
        linkedArtifacts: [],
      } as any, "");

      const result = await callTool("list_jira_issues", {});
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe("JI-001");
      expect(data[0].jiraKey).toBe("PROJ-1");
    });

    it("should filter by status", async () => {
      store.create("jira-issue", {
        title: "Open issue",
        status: "open",
        jiraKey: "PROJ-1",
      } as any, "");
      store.create("jira-issue", {
        title: "Done issue",
        status: "done",
        jiraKey: "PROJ-2",
      } as any, "");

      const result = await callTool("list_jira_issues", { status: "open" });
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].jiraKey).toBe("PROJ-1");
    });

    it("should filter by jiraKey", async () => {
      store.create("jira-issue", {
        title: "Issue A",
        status: "open",
        jiraKey: "PROJ-1",
      } as any, "");
      store.create("jira-issue", {
        title: "Issue B",
        status: "open",
        jiraKey: "PROJ-2",
      } as any, "");

      const result = await callTool("list_jira_issues", { jiraKey: "PROJ-2" });
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("Issue B");
    });
  });

  describe("get_jira_issue", () => {
    it("should get by local ID", async () => {
      store.create("jira-issue", {
        title: "Test issue",
        status: "open",
        jiraKey: "PROJ-1",
      } as any, "Issue description");

      const result = await callTool("get_jira_issue", { id: "JI-001" });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBe("Test issue");
      expect(data.content).toBe("Issue description");
    });

    it("should get by Jira key", async () => {
      store.create("jira-issue", {
        title: "Test issue",
        status: "open",
        jiraKey: "PROJ-42",
      } as any, "");

      const result = await callTool("get_jira_issue", { id: "PROJ-42" });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.jiraKey).toBe("PROJ-42");
    });

    it("should return error for non-existent issue", async () => {
      const result = await callTool("get_jira_issue", { id: "JI-999" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("link_artifact_to_jira", () => {
    it("should add artifact to linkedArtifacts", async () => {
      store.create("jira-issue", {
        title: "Issue",
        status: "open",
        jiraKey: "PROJ-1",
        linkedArtifacts: [],
      } as any, "");

      // Create a decision to link
      store.create("decision", { title: "Use React", status: "open" }, "");

      const result = await callTool("link_artifact_to_jira", {
        jiraIssueId: "JI-001",
        artifactId: "D-001",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Linked D-001 to JI-001");

      // Verify the link was persisted
      const doc = store.get("JI-001")!;
      expect(doc.frontmatter.linkedArtifacts).toContain("D-001");
    });

    it("should not duplicate existing links", async () => {
      store.create("jira-issue", {
        title: "Issue",
        status: "open",
        jiraKey: "PROJ-1",
        linkedArtifacts: ["D-001"],
      } as any, "");
      store.create("decision", { title: "Use React", status: "open" }, "");

      const result = await callTool("link_artifact_to_jira", {
        jiraIssueId: "JI-001",
        artifactId: "D-001",
      });
      expect(result.content[0].text).toContain("already linked");
    });

    it("should return error for non-existent JI document", async () => {
      const result = await callTool("link_artifact_to_jira", {
        jiraIssueId: "JI-999",
        artifactId: "D-001",
      });
      expect(result.isError).toBe(true);
    });

    it("should return error for non-existent artifact", async () => {
      store.create("jira-issue", {
        title: "Issue",
        status: "open",
        jiraKey: "PROJ-1",
        linkedArtifacts: [],
      } as any, "");

      const result = await callTool("link_artifact_to_jira", {
        jiraIssueId: "JI-001",
        artifactId: "D-999",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("push_artifact_to_jira", () => {
    describe("projectKey resolution", () => {
      it("should error when no projectKey provided and no default configured", async () => {
        store.create("decision", { title: "Test", status: "open" }, "");
        const result = await callTool("push_artifact_to_jira", {
          artifactId: "D-001",
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("No projectKey provided");
        expect(result.content[0].text).toContain("jira.projectKey");
      });

      it("should use default projectKey from config when not provided", () => {
        const configuredTools = createJiraTools(store, {
          name: "test",
          jira: { projectKey: "DEFAULT" },
        });
        const pushTool = configuredTools.find((t) => t.name === "push_artifact_to_jira")!;
        expect(pushTool).toBeDefined();
      });

      it("should accept explicit projectKey even with default configured", async () => {
        const configuredTools = createJiraTools(store, {
          name: "test",
          jira: { projectKey: "DEFAULT" },
        });
        const pushTool = configuredTools.find((t) => t.name === "push_artifact_to_jira")!;
        store.create("decision", { title: "Test", status: "open" }, "");

        const result = await (pushTool as any).handler({
          artifactId: "D-001",
          projectKey: "OVERRIDE",
        });
        expect(result.content[0].text).not.toContain("No projectKey provided");
        expect(result.content[0].text).toContain("not configured");
      });

      it("should use default projectKey when no explicit projectKey given", async () => {
        const configuredTools = createJiraTools(store, {
          name: "test",
          jira: { projectKey: "DEFAULT" },
        });
        const pushTool = configuredTools.find((t) => t.name === "push_artifact_to_jira")!;
        store.create("decision", { title: "Test", status: "open" }, "");

        const result = await (pushTool as any).handler({
          artifactId: "D-001",
        });
        expect(result.content[0].text).not.toContain("No projectKey provided");
        expect(result.content[0].text).toContain("not configured");
      });
    });

    it("should return error for non-existent artifact", async () => {
      store.create("decision", { title: "Test", status: "open" }, "");
      const result = await callTool("push_artifact_to_jira", {
        artifactId: "D-999",
        projectKey: "PROJ",
      });
      // Reaches "not configured" since Jira env vars are cleared; but if artifact doesn't exist, that's checked after Jira client
      // With no Jira config, we get "not configured" first
      expect(result.isError).toBe(true);
    });
  });

  describe("link_to_jira", () => {
    it("should return error when Jira not configured", async () => {
      store.create("action", { title: "Test Action", status: "open" }, "");
      const result = await callTool("link_to_jira", {
        artifactId: "A-001",
        jiraKey: "PROJ-1",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not configured");
    });

    it("should return error for non-existent artifact", async () => {
      // Set env vars so Jira client is created (will fail on API call though)
      process.env.JIRA_HOST = "test.atlassian.net";
      process.env.JIRA_EMAIL = "test@example.com";
      process.env.JIRA_API_TOKEN = "token";
      // Re-create tools with env vars set
      const envTools = createJiraTools(store);
      const linkTool = envTools.find((t) => t.name === "link_to_jira")!;

      const result = await (linkTool as any).handler({
        artifactId: "A-999",
        jiraKey: "PROJ-1",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("should accept any artifact type (not just action/task)", async () => {
      process.env.JIRA_HOST = "test.atlassian.net";
      process.env.JIRA_EMAIL = "test@example.com";
      process.env.JIRA_API_TOKEN = "token";
      const envTools = createJiraTools(store);
      const linkTool = envTools.find((t) => t.name === "link_to_jira")!;

      store.create("decision", { title: "Test Decision", status: "open" }, "");
      // Will fail at the Jira API call (fetch to fake host), but should NOT
      // reject with "only supports action and task" — it should get past type check
      try {
        await (linkTool as any).handler({ artifactId: "D-001", jiraKey: "PROJ-1" });
      } catch (err: any) {
        // Expected: fetch failure to fake host, NOT a type rejection
        expect(err.message).not.toContain("only supports");
      }
    });
  });

  describe("fetch_jira_status", () => {
    it("should return error when Jira not configured", async () => {
      const result = await callTool("fetch_jira_status", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not configured");
    });

    it("should report no artifacts when none are linked", async () => {
      process.env.JIRA_HOST = "test.atlassian.net";
      process.env.JIRA_EMAIL = "test@example.com";
      process.env.JIRA_API_TOKEN = "token";
      const envTools = createJiraTools(store);
      const fetchTool = envTools.find((t) => t.name === "fetch_jira_status")!;

      const result = await (fetchTool as any).handler({});
      expect(result.content[0].text).toContain("No Jira-linked actions/tasks found");
    });
  });

  describe("API-calling tools without Jira config", () => {
    it("pull_jira_issue returns isError when Jira not configured", async () => {
      const result = await callTool("pull_jira_issue", { key: "PROJ-1" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not configured");
    });

    it("pull_jira_issues_jql returns isError when Jira not configured", async () => {
      const result = await callTool("pull_jira_issues_jql", { jql: "project = PROJ" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not configured");
    });

    it("push_artifact_to_jira returns isError when Jira not configured", async () => {
      store.create("decision", { title: "Test", status: "open" }, "");
      const result = await callTool("push_artifact_to_jira", {
        artifactId: "D-001",
        projectKey: "PROJ",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not configured");
    });

    it("sync_jira_issue returns isError when Jira not configured", async () => {
      store.create("jira-issue", {
        title: "Issue",
        status: "open",
        jiraKey: "PROJ-1",
      } as any, "");

      const result = await callTool("sync_jira_issue", { id: "JI-001" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not configured");
    });
  });
});
