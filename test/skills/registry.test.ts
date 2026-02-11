import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import {
  loadAllSkills,
  resolveSkillsForPersona,
  getSkillTools,
  getSkillPromptFragment,
  listAllSkillInfo,
} from "../../src/skills/registry.js";
import type { SkillDefinition } from "../../src/skills/types.js";

describe("loadAllSkills", () => {
  let tmpDir: string;
  let marvinDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-skills-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "skills"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should load builtin skills by default", () => {
    const skills = loadAllSkills();
    expect(skills.has("governance-review")).toBe(true);
    const gr = skills.get("governance-review")!;
    expect(gr.name).toBe("Governance Review");
    expect(gr.version).toBe("1.0.0");
  });

  it("should load YAML skills from .marvin/skills/", () => {
    const yamlSkill = {
      id: "custom-review",
      name: "Custom Review",
      description: "A custom skill",
      version: "0.1.0",
      personas: ["tech-lead"],
      actions: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Run analysis",
          systemPrompt: "Analyze the codebase.",
          maxTurns: 3,
        },
      ],
    };
    fs.writeFileSync(
      path.join(marvinDir, "skills", "custom-review.yaml"),
      YAML.stringify(yamlSkill),
      "utf-8",
    );

    const skills = loadAllSkills(marvinDir);
    expect(skills.has("custom-review")).toBe(true);
    const cr = skills.get("custom-review")!;
    expect(cr.name).toBe("Custom Review");
    expect(cr.personas).toEqual(["tech-lead"]);
    expect(cr.actions).toHaveLength(1);
    expect(cr.actions![0].id).toBe("analyze");
  });

  it("should skip invalid YAML files gracefully", () => {
    fs.writeFileSync(
      path.join(marvinDir, "skills", "broken.yaml"),
      "this is not: valid: yaml: [",
      "utf-8",
    );

    const skills = loadAllSkills(marvinDir);
    // Should still have builtins and not crash
    expect(skills.has("governance-review")).toBe(true);
    expect(skills.has("broken")).toBe(false);
  });

  it("should skip YAML without required fields", () => {
    const incomplete = { id: "no-name", description: "Missing name field" };
    fs.writeFileSync(
      path.join(marvinDir, "skills", "incomplete.yaml"),
      YAML.stringify(incomplete),
      "utf-8",
    );

    const skills = loadAllSkills(marvinDir);
    expect(skills.has("no-name")).toBe(false);
  });

  it("should return only builtins when skills dir is empty", () => {
    const skills = loadAllSkills(marvinDir);
    expect(skills.size).toBeGreaterThanOrEqual(1);
    expect(skills.has("governance-review")).toBe(true);
  });

  it("should return only builtins when no marvinDir provided", () => {
    const skills = loadAllSkills();
    expect(skills.size).toBeGreaterThanOrEqual(1);
    expect(skills.has("governance-review")).toBe(true);
  });

  it("should load .yml files too", () => {
    const yamlSkill = {
      id: "yml-skill",
      name: "YML Skill",
      description: "Uses .yml extension",
      version: "1.0.0",
    };
    fs.writeFileSync(
      path.join(marvinDir, "skills", "yml-skill.yml"),
      YAML.stringify(yamlSkill),
      "utf-8",
    );

    const skills = loadAllSkills(marvinDir);
    expect(skills.has("yml-skill")).toBe(true);
  });

  it("should ignore non-YAML files", () => {
    fs.writeFileSync(
      path.join(marvinDir, "skills", "readme.md"),
      "# Not a skill",
      "utf-8",
    );

    const skills = loadAllSkills(marvinDir);
    // Should only have builtins
    const nonBuiltinCount = [...skills.keys()].filter(
      (k) => k !== "governance-review",
    ).length;
    expect(nonBuiltinCount).toBe(0);
  });
});

describe("resolveSkillsForPersona", () => {
  it("should use explicit config when present", () => {
    const skills = loadAllSkills();
    const config = { "tech-lead": ["governance-review"] };

    const resolved = resolveSkillsForPersona("tech-lead", config, skills);
    expect(resolved).toEqual(["governance-review"]);
  });

  it("should fall back to default persona affinity when no config", () => {
    const skills = loadAllSkills();

    const resolved = resolveSkillsForPersona("delivery-manager", undefined, skills);
    expect(resolved).toContain("governance-review");
  });

  it("should return empty for persona with no affinity and no config", () => {
    const skills = loadAllSkills();

    const resolved = resolveSkillsForPersona("tech-lead", undefined, skills);
    expect(resolved).toEqual([]);
  });

  it("should filter out non-existent skills from config", () => {
    const skills = loadAllSkills();
    const config = { "product-owner": ["governance-review", "nonexistent-skill"] };

    const resolved = resolveSkillsForPersona("product-owner", config, skills);
    expect(resolved).toEqual(["governance-review"]);
  });

  it("should use config over default affinity", () => {
    const skills = loadAllSkills();
    // governance-review has default affinity to dm & po, but config overrides
    const config = { "delivery-manager": [] as string[] };

    const resolved = resolveSkillsForPersona("delivery-manager", config, skills);
    expect(resolved).toEqual([]);
  });
});

describe("getSkillTools", () => {
  it("should return empty for skills without code tools", () => {
    const skills = loadAllSkills();
    const store = {} as any;

    const tools = getSkillTools(["governance-review"], skills, store);
    expect(tools).toEqual([]);
  });

  it("should return tools from code skills", () => {
    const mockTool = { name: "test_tool", description: "test", inputSchema: {}, handler: async () => ({ content: [] }) };
    const skills = new Map<string, SkillDefinition>();
    skills.set("code-skill", {
      id: "code-skill",
      name: "Code Skill",
      description: "A skill with tools",
      version: "1.0.0",
      tools: () => [mockTool as any],
    });

    const tools = getSkillTools(["code-skill"], skills, {} as any);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("test_tool");
  });

  it("should skip unknown skill IDs", () => {
    const skills = loadAllSkills();
    const tools = getSkillTools(["nonexistent"], skills, {} as any);
    expect(tools).toEqual([]);
  });
});

describe("getSkillPromptFragment", () => {
  it("should return persona-specific fragment", () => {
    const skills = loadAllSkills();

    const fragment = getSkillPromptFragment(
      ["governance-review"],
      skills,
      "delivery-manager",
    );
    expect(fragment).toBeDefined();
    expect(fragment).toContain("Governance Review");
    expect(fragment).toContain("governance-review__summarize");
  });

  it("should fall back to wildcard fragment", () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set("wildcard-skill", {
      id: "wildcard-skill",
      name: "Wildcard Skill",
      description: "Uses wildcard",
      version: "1.0.0",
      promptFragments: { "*": "Available to all personas." },
    });

    const fragment = getSkillPromptFragment(
      ["wildcard-skill"],
      skills,
      "any-persona",
    );
    expect(fragment).toContain("Available to all personas");
    expect(fragment).toContain("Wildcard Skill");
  });

  it("should prefer persona-specific over wildcard", () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set("both-skill", {
      id: "both-skill",
      name: "Both Skill",
      description: "Has both",
      version: "1.0.0",
      promptFragments: {
        "product-owner": "PO-specific fragment",
        "*": "Generic fragment",
      },
    });

    const fragment = getSkillPromptFragment(
      ["both-skill"],
      skills,
      "product-owner",
    );
    expect(fragment).toContain("PO-specific fragment");
    expect(fragment).not.toContain("Generic fragment");
  });

  it("should return undefined when no matching fragments", () => {
    const skills = loadAllSkills();

    const fragment = getSkillPromptFragment(
      ["governance-review"],
      skills,
      "tech-lead",
    );
    expect(fragment).toBeUndefined();
  });

  it("should combine fragments from multiple skills", () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set("skill-a", {
      id: "skill-a",
      name: "Skill A",
      description: "First",
      version: "1.0.0",
      promptFragments: { "*": "Fragment A" },
    });
    skills.set("skill-b", {
      id: "skill-b",
      name: "Skill B",
      description: "Second",
      version: "1.0.0",
      promptFragments: { "*": "Fragment B" },
    });

    const fragment = getSkillPromptFragment(
      ["skill-a", "skill-b"],
      skills,
      "any-persona",
    );
    expect(fragment).toContain("Fragment A");
    expect(fragment).toContain("Fragment B");
    expect(fragment).toContain("### Skill A");
    expect(fragment).toContain("### Skill B");
  });
});

describe("listAllSkillInfo", () => {
  it("should list all skills with persona assignments", () => {
    const skills = loadAllSkills();
    const personaIds = ["product-owner", "delivery-manager", "tech-lead"];

    const infos = listAllSkillInfo(skills, undefined, personaIds);
    expect(infos.length).toBeGreaterThanOrEqual(1);

    const gr = infos.find((i) => i.id === "governance-review");
    expect(gr).toBeDefined();
    expect(gr!.assignedPersonas).toContain("delivery-manager");
    expect(gr!.assignedPersonas).toContain("product-owner");
    expect(gr!.assignedPersonas).not.toContain("tech-lead");
  });

  it("should respect explicit config for persona assignments", () => {
    const skills = loadAllSkills();
    const config = { "tech-lead": ["governance-review"] };
    const personaIds = ["product-owner", "delivery-manager", "tech-lead"];

    const infos = listAllSkillInfo(skills, config, personaIds);
    const gr = infos.find((i) => i.id === "governance-review");
    expect(gr).toBeDefined();
    // With explicit config for tech-lead, but dm and po still use defaults
    expect(gr!.assignedPersonas).toContain("tech-lead");
    expect(gr!.assignedPersonas).toContain("delivery-manager");
    expect(gr!.assignedPersonas).toContain("product-owner");
  });
});
