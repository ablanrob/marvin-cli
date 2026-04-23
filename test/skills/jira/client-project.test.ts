import { describe, it, expect, afterEach } from "vitest";
import { createJiraClient, resolveJiraStatus } from "../../../src/skills/builtin/jira/client.js";

function restoreEnv(original: Record<string, string | undefined>): void {
  // Remove keys that weren't in the original
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) {
      Reflect.deleteProperty(process.env, key);
    }
  }
  // Restore original values
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}

describe("createJiraClient with project config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  it("should prefer project config over user config and env vars", () => {
    process.env.JIRA_HOST = "env.atlassian.net";
    process.env.JIRA_EMAIL = "env@example.com";
    process.env.JIRA_API_TOKEN = "env-token";

    const result = createJiraClient({
      project: { host: "project.atlassian.net", email: "project@example.com" },
      user: { host: "user.atlassian.net", email: "user@example.com", apiToken: "user-token" },
    });

    expect(result).not.toBeNull();
    expect(result!.host).toBe("project.atlassian.net");
  });

  it("should fall back to user config when project config is partial", () => {
    delete process.env.JIRA_HOST;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;

    const result = createJiraClient({
      project: { host: "project.atlassian.net" },
      user: { email: "user@example.com", apiToken: "user-token" },
    });

    expect(result).not.toBeNull();
    expect(result!.host).toBe("project.atlassian.net");
  });

  it("should fall back to env vars when both configs are missing", () => {
    process.env.JIRA_HOST = "env.atlassian.net";
    process.env.JIRA_EMAIL = "env@example.com";
    process.env.JIRA_API_TOKEN = "env-token";

    const result = createJiraClient({ project: undefined, user: undefined });

    expect(result).not.toBeNull();
    expect(result!.host).toBe("env.atlassian.net");
  });

  it("should return null when apiToken is only in project config (not supported)", () => {
    delete process.env.JIRA_HOST;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;

    // Project config doesn't carry apiToken — intentionally
    const result = createJiraClient({
      project: { host: "project.atlassian.net", email: "project@example.com" },
      user: undefined,
    });

    expect(result).toBeNull();
  });

  it("should still work with legacy (user-only) signature", () => {
    delete process.env.JIRA_HOST;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;

    const result = createJiraClient({
      host: "legacy.atlassian.net",
      email: "legacy@example.com",
      apiToken: "legacy-token",
    });

    expect(result).not.toBeNull();
    expect(result!.host).toBe("legacy.atlassian.net");
  });
});

describe("resolveJiraStatus", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  it("should report all configured when credentials exist", () => {
    process.env.JIRA_HOST = "test.atlassian.net";
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_API_TOKEN = "secret-token";

    const status = resolveJiraStatus();

    expect(status.host.configured).toBe(true);
    expect(status.host.value).toBe("test.atlassian.net");
    expect(status.host.source).toBe("env");
    expect(status.email.configured).toBe(true);
    expect(status.email.source).toBe("env");
    expect(status.apiToken.configured).toBe(true);
    expect(status.apiToken.source).toBe("env");
  });

  it("should not expose email or token values", () => {
    process.env.JIRA_HOST = "test.atlassian.net";
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_API_TOKEN = "secret-token";

    const status = resolveJiraStatus();
    const json = JSON.stringify(status);

    expect(json).not.toContain("user@example.com");
    expect(json).not.toContain("secret-token");
  });

  it("should report unconfigured when credentials are missing", () => {
    delete process.env.JIRA_HOST;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;

    const status = resolveJiraStatus();

    expect(status.host.configured).toBe(false);
    expect(status.host.value).toBeUndefined();
    expect(status.email.configured).toBe(false);
    expect(status.apiToken.configured).toBe(false);
  });

  it("should report project as source when project config provides host", () => {
    delete process.env.JIRA_HOST;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;

    const status = resolveJiraStatus({
      project: { host: "project.atlassian.net", email: "proj@example.com" },
      user: { apiToken: "token" },
    });

    expect(status.host.configured).toBe(true);
    expect(status.host.source).toBe("project");
    expect(status.host.value).toBe("project.atlassian.net");
    expect(status.email.source).toBe("project");
    expect(status.apiToken.source).toBe("user");
  });

  it("should normalize host by stripping protocol", () => {
    const status = resolveJiraStatus({
      project: { host: "https://myco.atlassian.net/" },
    });

    expect(status.host.value).toBe("myco.atlassian.net");
  });
});
