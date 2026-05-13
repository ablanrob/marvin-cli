import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../src/storage/store.js";
import type { MarvinProjectConfig } from "../../src/core/config.js";
import { COMMON_REGISTRATIONS } from "../../src/plugins/common.js";
import { createBootstrapTools } from "../../src/methodology/bootstrap-tools.js";

function extractHandler(tools: any[], name: string): (args: any) => Promise<any> {
  const t = tools.find((tool) => tool.name === name);
  if (!t) throw new Error(`Tool "${name}" not found`);
  return (t as any).handler;
}

function parseResult(result: any): any {
  return JSON.parse(result.content[0].text);
}

describe("bootstrap_sprint_zero tool", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-bootstrap-tool-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs", "decisions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "actions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "questions"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "sprints"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "features"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "epics"), { recursive: true });
    fs.mkdirSync(path.join(marvinDir, "docs", "tasks"), { recursive: true });
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function getConfig(methodology = "generic-agile"): MarvinProjectConfig {
    return { name: "test", methodology } as MarvinProjectConfig;
  }

  it("creates exactly 1 tool", () => {
    const tools = createBootstrapTools(store, { config: getConfig() });
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("bootstrap_sprint_zero");
  });

  it("starts at survey when no step specified", async () => {
    const tools = createBootstrapTools(store, { config: getConfig() });
    const handler = extractHandler(tools, "bootstrap_sprint_zero");

    const result = await handler({});
    const data = parseResult(result);
    expect(data.step).toBe("survey");
    expect(data.nextStep).toBe("draft");
  });

  it("returns error when config not available", async () => {
    const tools = createBootstrapTools(store);
    const handler = extractHandler(tools, "bootstrap_sprint_zero");

    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("config not initialized");
  });

  it("runs each step correctly", async () => {
    store.create("feature", { title: "F1", status: "draft" }, "desc");
    const tools = createBootstrapTools(store, { config: getConfig() });
    const handler = extractHandler(tools, "bootstrap_sprint_zero");

    const surveyResult = await handler({});
    expect(parseResult(surveyResult).step).toBe("survey");

    const draftResult = await handler({ step: "draft" });
    expect(parseResult(draftResult).step).toBe("draft");

    const populateResult = await handler({ step: "populate" });
    expect(parseResult(populateResult).step).toBe("populate");

    const reviewResult = await handler({ step: "review" });
    expect(parseResult(reviewResult).step).toBe("review");

    const commitResult = await handler({ step: "commit" });
    expect(parseResult(commitResult).step).toBe("commit");
    expect(parseResult(commitResult).sprintId).toMatch(/^SP-/);
  });

  it("returns error on duplicate commit", async () => {
    const tools = createBootstrapTools(store, { config: getConfig() });
    const handler = extractHandler(tools, "bootstrap_sprint_zero");

    // First commit
    await handler({ step: "commit" });

    // Second commit should error
    const result = await handler({ step: "commit" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("already exists");
  });

  it("restricts populate to a specific section", async () => {
    const tools = createBootstrapTools(store, { config: getConfig() });
    const handler = extractHandler(tools, "bootstrap_sprint_zero");

    const result = await handler({
      step: "populate",
      section: "ceremony-scheduling",
    });
    const data = parseResult(result);
    expect(data.section).toBe("ceremony-scheduling");
    for (const item of data.proposedItems) {
      expect(item.title).toContain("Ceremonies");
    }
  });
});
