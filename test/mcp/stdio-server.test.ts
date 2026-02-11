import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { collectTools, registerSdkTools } from "../../src/mcp/stdio-server.js";

function createTempMarvinDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-mcp-test-"));
  const marvinDir = path.join(tmpDir, ".marvin");
  fs.mkdirSync(marvinDir, { recursive: true });
  fs.writeFileSync(
    path.join(marvinDir, "config.yaml"),
    YAML.stringify({ name: "test-project" }),
  );
  // Create doc subdirectories
  for (const dir of ["decisions", "actions", "questions"]) {
    fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
  }
  return marvinDir;
}

function cleanupDir(marvinDir: string): void {
  const root = path.dirname(marvinDir);
  fs.rmSync(root, { recursive: true, force: true });
}

describe("collectTools", () => {
  let marvinDir: string;

  beforeEach(() => {
    marvinDir = createTempMarvinDir();
  });

  afterEach(() => {
    cleanupDir(marvinDir);
  });

  it("should return core tool names", () => {
    const tools = collectTools(marvinDir);
    const names = tools.map((t) => t.name);

    expect(names).toContain("list_decisions");
    expect(names).toContain("create_decision");
    expect(names).toContain("list_actions");
    expect(names).toContain("create_action");
    expect(names).toContain("list_questions");
    expect(names).toContain("create_question");
    expect(names).toContain("search_documents");
    expect(names).toContain("project_summary");
  });

  it("should include source tools when sources dir exists", () => {
    fs.mkdirSync(path.join(marvinDir, "sources"), { recursive: true });
    const tools = collectTools(marvinDir);
    const names = tools.map((t) => t.name);

    expect(names).toContain("list_sources");
    expect(names).toContain("get_source_info");
  });

  it("should not include source tools when no sources dir", () => {
    const tools = collectTools(marvinDir);
    const names = tools.map((t) => t.name);

    expect(names).not.toContain("list_sources");
  });
});

describe("registerSdkTools", () => {
  let marvinDir: string;

  beforeEach(() => {
    marvinDir = createTempMarvinDir();
  });

  afterEach(() => {
    cleanupDir(marvinDir);
  });

  it("should register all tools on McpServer without errors", () => {
    const server = new McpServer(
      { name: "test-server", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );
    const tools = collectTools(marvinDir);

    expect(() => registerSdkTools(server, tools)).not.toThrow();
  });
});

describe("round-trip tool calls", () => {
  let marvinDir: string;
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    marvinDir = createTempMarvinDir();

    server = new McpServer(
      { name: "test-server", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );
    const tools = collectTools(marvinDir);
    registerSdkTools(server, tools);

    client = new Client({ name: "test-client", version: "0.1.0" });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    cleanupDir(marvinDir);
  });

  it("should call project_summary and get valid response", async () => {
    const result = await client.callTool({ name: "project_summary", arguments: {} });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);

    const textContent = (result.content as Array<{ type: string; text: string }>).find(
      (c) => c.type === "text",
    );
    expect(textContent).toBeDefined();

    const parsed = JSON.parse(textContent!.text);
    expect(parsed).toHaveProperty("totals");
    expect(parsed).toHaveProperty("open");
  });

  it("should call create_decision and verify file created", async () => {
    const result = await client.callTool({
      name: "create_decision",
      arguments: {
        title: "Use MCP for integration",
        content: "We will use the MCP protocol for external tool integration.",
      },
    });

    const textContent = (result.content as Array<{ type: string; text: string }>).find(
      (c) => c.type === "text",
    );

    expect(result.isError).toBeFalsy();
    expect(textContent!.text).toContain("Created decision D-001");

    // Verify file exists on disk
    const decisionsDir = path.join(marvinDir, "docs", "decisions");
    const files = fs.readdirSync(decisionsDir);
    expect(files).toContain("D-001.md");

    // Verify content
    const content = fs.readFileSync(
      path.join(decisionsDir, "D-001.md"),
      "utf-8",
    );
    expect(content).toContain("Use MCP for integration");
  });

  it("should list tools via client", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    expect(names).toContain("list_decisions");
    expect(names).toContain("create_decision");
    expect(names).toContain("project_summary");
  });
});
