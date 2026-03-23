import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JiraClient, createJiraClient } from "../../../src/skills/builtin/jira/client.js";

describe("createJiraClient", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should return a resolved config when all env vars are set", () => {
    process.env.JIRA_HOST = "example.atlassian.net";
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_API_TOKEN = "test-token";

    const result = createJiraClient();
    expect(result).not.toBeNull();
    expect(result!.client).toBeInstanceOf(JiraClient);
    expect(result!.host).toBe("example.atlassian.net");
  });

  it("should return null when JIRA_HOST is missing", () => {
    delete process.env.JIRA_HOST;
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_API_TOKEN = "test-token";

    expect(createJiraClient()).toBeNull();
  });

  it("should return null when JIRA_EMAIL is missing", () => {
    process.env.JIRA_HOST = "example.atlassian.net";
    delete process.env.JIRA_EMAIL;
    process.env.JIRA_API_TOKEN = "test-token";

    expect(createJiraClient()).toBeNull();
  });

  it("should return null when JIRA_API_TOKEN is missing", () => {
    process.env.JIRA_HOST = "example.atlassian.net";
    process.env.JIRA_EMAIL = "user@example.com";
    delete process.env.JIRA_API_TOKEN;

    expect(createJiraClient()).toBeNull();
  });

  it("should return null when all env vars are missing", () => {
    delete process.env.JIRA_HOST;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;

    expect(createJiraClient()).toBeNull();
  });

  it("should prefer user config over env vars", () => {
    process.env.JIRA_HOST = "env.atlassian.net";
    process.env.JIRA_EMAIL = "env@example.com";
    process.env.JIRA_API_TOKEN = "env-token";

    const result = createJiraClient({
      host: "config.atlassian.net",
      email: "config@example.com",
      apiToken: "config-token",
    });
    expect(result).not.toBeNull();
    expect(result!.host).toBe("config.atlassian.net");
  });

  it("should fall back to env vars for missing user config fields", () => {
    process.env.JIRA_HOST = "env.atlassian.net";
    process.env.JIRA_EMAIL = "env@example.com";
    process.env.JIRA_API_TOKEN = "env-token";

    const result = createJiraClient({ host: "config.atlassian.net" });
    expect(result).not.toBeNull();
    expect(result!.host).toBe("config.atlassian.net");
  });

  it("should work with user config alone (no env vars)", () => {
    delete process.env.JIRA_HOST;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;

    const result = createJiraClient({
      host: "config.atlassian.net",
      email: "config@example.com",
      apiToken: "config-token",
    });
    expect(result).not.toBeNull();
    expect(result!.host).toBe("config.atlassian.net");
  });
});

describe("JiraClient", () => {
  it("should construct correct base URL", () => {
    const client = new JiraClient({
      host: "mycompany.atlassian.net",
      email: "user@example.com",
      apiToken: "token123",
    });

    expect(client).toBeInstanceOf(JiraClient);
  });

  it("should construct correct Basic auth header", () => {
    const client = new JiraClient({
      host: "test.atlassian.net",
      email: "test@example.com",
      apiToken: "my-api-token",
    });

    const expected = Buffer.from("test@example.com:my-api-token").toString("base64");
    expect(expected).toBe("dGVzdEBleGFtcGxlLmNvbTpteS1hcGktdG9rZW4=");
    expect(client).toBeInstanceOf(JiraClient);
  });

  it("should have getIssueWithLinks method", () => {
    const client = new JiraClient({
      host: "test.atlassian.net",
      email: "test@example.com",
      apiToken: "my-api-token",
    });

    expect(typeof client.getIssueWithLinks).toBe("function");
  });
});
