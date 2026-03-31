import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildSystemPrompt } from "../../src/personas/prompt-builder.js";
import type { PersonaDefinition } from "../../src/personas/types.js";
import type { MarvinProjectConfig } from "../../src/core/config.js";

const testPersona: PersonaDefinition = {
  id: "product-owner",
  name: "Product Owner",
  shortName: "po",
  description: "Test persona",
  systemPrompt: "You are a Product Owner.",
  focusAreas: ["backlog"],
  documentTypes: ["decisions"],
};

const testConfig: MarvinProjectConfig = {
  name: "Test Project",
};

describe("buildSystemPrompt", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should include persona system prompt", () => {
    const result = buildSystemPrompt(testPersona, testConfig);
    expect(result).toContain("You are a Product Owner.");
  });

  it("should include project context", () => {
    const result = buildSystemPrompt(testPersona, testConfig);
    expect(result).toContain("Test Project");
    expect(result).toContain("## Project Context");
  });

  it("should include available tools section", () => {
    const result = buildSystemPrompt(testPersona, testConfig);
    expect(result).toContain("## Available Tools");
  });

  it("should inject CLAUDE.md content when file exists", () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "Custom project instructions here.", "utf-8");

    const result = buildSystemPrompt(testPersona, testConfig, undefined, undefined, tmpDir);
    expect(result).toContain("## Project Instructions");
    expect(result).toContain("Custom project instructions here.");
  });

  it("should position CLAUDE.md before Available Tools", () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "Custom instructions.", "utf-8");

    const result = buildSystemPrompt(testPersona, testConfig, undefined, undefined, tmpDir);
    const instructionsIdx = result.indexOf("## Project Instructions");
    const toolsIdx = result.indexOf("## Available Tools");
    expect(instructionsIdx).toBeGreaterThan(-1);
    expect(toolsIdx).toBeGreaterThan(instructionsIdx);
  });

  it("should position CLAUDE.md after persona prompt", () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "Custom instructions.", "utf-8");

    const result = buildSystemPrompt(testPersona, testConfig, undefined, undefined, tmpDir);
    const personaIdx = result.indexOf("You are a Product Owner.");
    const instructionsIdx = result.indexOf("## Project Instructions");
    expect(personaIdx).toBeGreaterThan(-1);
    expect(instructionsIdx).toBeGreaterThan(personaIdx);
  });

  it("should skip when CLAUDE.md does not exist", () => {
    const result = buildSystemPrompt(testPersona, testConfig, undefined, undefined, tmpDir);
    expect(result).not.toContain("## Project Instructions");
  });

  it("should skip when CLAUDE.md is empty", () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "  \n  ", "utf-8");

    const result = buildSystemPrompt(testPersona, testConfig, undefined, undefined, tmpDir);
    expect(result).not.toContain("## Project Instructions");
  });

  it("should skip when marvinDir is not provided", () => {
    const result = buildSystemPrompt(testPersona, testConfig);
    expect(result).not.toContain("## Project Instructions");
  });
});
