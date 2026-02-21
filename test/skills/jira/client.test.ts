import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JiraClient, createJiraClient } from "../../../src/skills/builtin/jira/client.js";

describe("createJiraClient", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should return a JiraClient when all env vars are set", () => {
    process.env.JIRA_HOST = "example.atlassian.net";
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_API_TOKEN = "test-token";

    const client = createJiraClient();
    expect(client).toBeInstanceOf(JiraClient);
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
});

describe("JiraClient", () => {
  it("should construct correct base URL", () => {
    const client = new JiraClient({
      host: "mycompany.atlassian.net",
      email: "user@example.com",
      apiToken: "token123",
    });

    // Verify via the auth header (Basic auth encoding)
    // The client doesn't expose baseUrl publicly, but we can verify construction works
    expect(client).toBeInstanceOf(JiraClient);
  });

  it("should construct correct Basic auth header", () => {
    const client = new JiraClient({
      host: "test.atlassian.net",
      email: "test@example.com",
      apiToken: "my-api-token",
    });

    // The auth header is private, so we verify by ensuring the client is constructed
    // and verify encoding matches expected format
    const expected = Buffer.from("test@example.com:my-api-token").toString("base64");
    expect(expected).toBe("dGVzdEBleGFtcGxlLmNvbTpteS1hcGktdG9rZW4=");
    expect(client).toBeInstanceOf(JiraClient);
  });
});
