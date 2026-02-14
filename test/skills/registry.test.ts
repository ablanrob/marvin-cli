import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import matter from "gray-matter";
import {
  loadAllSkills,
  loadSkillFromDirectory,
  resolveSkillsForPersona,
  getSkillTools,
  getSkillPromptFragment,
  listAllSkillInfo,
  getSkillAgentDefinitions,
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
    expect(gr.format).toBe("builtin-ts");
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
    expect(cr.format).toBe("yaml");
    expect(cr.personas).toEqual(["tech-lead"]);
    expect(cr.actions).toHaveLength(1);
    expect(cr.actions![0].id).toBe("analyze");
  });

  it("should load SKILL.md directories from .marvin/skills/", () => {
    const skillDir = path.join(marvinDir, "skills", "my-skill");
    fs.mkdirSync(path.join(skillDir, "personas"), { recursive: true });

    const frontmatter = {
      name: "my-skill",
      description: "A SKILL.md skill",
      metadata: { version: "2.0.0", personas: ["tech-lead"] },
    };
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      matter.stringify("\nWildcard prompt.\n", frontmatter),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(skillDir, "personas", "tech-lead.md"),
      "TL-specific prompt.\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(skillDir, "actions.yaml"),
      YAML.stringify([{ id: "run", name: "Run", description: "Run it", systemPrompt: "Do it.", maxTurns: 3 }]),
      "utf-8",
    );

    const skills = loadAllSkills(marvinDir);
    expect(skills.has("my-skill")).toBe(true);
    const sk = skills.get("my-skill")!;
    expect(sk.format).toBe("skill-md");
    expect(sk.dirPath).toBe(skillDir);
    expect(sk.version).toBe("2.0.0");
    expect(sk.personas).toEqual(["tech-lead"]);
    expect(sk.promptFragments?.["*"]).toBe("Wildcard prompt.");
    expect(sk.promptFragments?.["tech-lead"]).toBe("TL-specific prompt.");
    expect(sk.actions).toHaveLength(1);
    expect(sk.actions![0].id).toBe("run");
  });

  it("should load mixed YAML and SKILL.md from same directory", () => {
    // YAML skill
    const yamlSkill = {
      id: "yaml-skill",
      name: "YAML Skill",
      description: "Legacy",
      version: "1.0.0",
    };
    fs.writeFileSync(
      path.join(marvinDir, "skills", "yaml-skill.yaml"),
      YAML.stringify(yamlSkill),
      "utf-8",
    );

    // SKILL.md skill
    const skillDir = path.join(marvinDir, "skills", "md-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      matter.stringify("\nPrompt.\n", { name: "md-skill", description: "New format" }),
      "utf-8",
    );

    const skills = loadAllSkills(marvinDir);
    expect(skills.has("yaml-skill")).toBe(true);
    expect(skills.has("md-skill")).toBe(true);
    expect(skills.get("yaml-skill")!.format).toBe("yaml");
    expect(skills.get("md-skill")!.format).toBe("skill-md");
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

describe("loadSkillFromDirectory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-skillmd-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should parse SKILL.md frontmatter and body", () => {
    const skillDir = path.join(tmpDir, "test-skill");
    fs.mkdirSync(skillDir, { recursive: true });

    const frontmatter = {
      name: "test-skill",
      description: "A test skill",
      metadata: { version: "1.2.3", personas: ["delivery-manager"] },
    };
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      matter.stringify("\nTest body prompt.\n", frontmatter),
      "utf-8",
    );

    const skill = loadSkillFromDirectory(skillDir);
    expect(skill).toBeDefined();
    expect(skill!.id).toBe("test-skill");
    expect(skill!.name).toBe("Test Skill");
    expect(skill!.description).toBe("A test skill");
    expect(skill!.version).toBe("1.2.3");
    expect(skill!.format).toBe("skill-md");
    expect(skill!.dirPath).toBe(skillDir);
    expect(skill!.personas).toEqual(["delivery-manager"]);
    expect(skill!.promptFragments?.["*"]).toBe("Test body prompt.");
  });

  it("should load persona variant files", () => {
    const skillDir = path.join(tmpDir, "persona-skill");
    fs.mkdirSync(path.join(skillDir, "personas"), { recursive: true });

    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      matter.stringify("\nWildcard.\n", { name: "persona-skill", description: "desc" }),
      "utf-8",
    );
    fs.writeFileSync(path.join(skillDir, "personas", "dm.md"), "DM prompt.\n", "utf-8");
    fs.writeFileSync(path.join(skillDir, "personas", "po.md"), "PO prompt.\n", "utf-8");

    const skill = loadSkillFromDirectory(skillDir);
    expect(skill!.promptFragments).toEqual({
      "*": "Wildcard.",
      "dm": "DM prompt.",
      "po": "PO prompt.",
    });
  });

  it("should load actions.yaml", () => {
    const skillDir = path.join(tmpDir, "action-skill");
    fs.mkdirSync(skillDir, { recursive: true });

    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      matter.stringify("\n", { name: "action-skill", description: "desc" }),
      "utf-8",
    );

    const actions = [
      { id: "analyze", name: "Analyze", description: "Analyze stuff", systemPrompt: "Analyze.", maxTurns: 3 },
      { id: "report", name: "Report", description: "Generate report", systemPrompt: "Report.", maxTurns: 5 },
    ];
    fs.writeFileSync(path.join(skillDir, "actions.yaml"), YAML.stringify(actions), "utf-8");

    const skill = loadSkillFromDirectory(skillDir);
    expect(skill!.actions).toHaveLength(2);
    expect(skill!.actions![0].id).toBe("analyze");
    expect(skill!.actions![1].id).toBe("report");
  });

  it("should return undefined for directory without SKILL.md", () => {
    const emptyDir = path.join(tmpDir, "empty");
    fs.mkdirSync(emptyDir, { recursive: true });

    expect(loadSkillFromDirectory(emptyDir)).toBeUndefined();
  });

  it("should return undefined for SKILL.md missing required fields", () => {
    const skillDir = path.join(tmpDir, "bad-skill");
    fs.mkdirSync(skillDir, { recursive: true });

    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      matter.stringify("\n", { name: "bad-skill" }), // missing description
      "utf-8",
    );

    expect(loadSkillFromDirectory(skillDir)).toBeUndefined();
  });

  it("should default version to 1.0.0 when not specified", () => {
    const skillDir = path.join(tmpDir, "no-version");
    fs.mkdirSync(skillDir, { recursive: true });

    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      matter.stringify("\n", { name: "no-version", description: "desc" }),
      "utf-8",
    );

    const skill = loadSkillFromDirectory(skillDir);
    expect(skill!.version).toBe("1.0.0");
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
      format: "builtin-ts",
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
      format: "yaml",
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
      format: "yaml",
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
      format: "yaml",
      promptFragments: { "*": "Fragment A" },
    });
    skills.set("skill-b", {
      id: "skill-b",
      name: "Skill B",
      description: "Second",
      version: "1.0.0",
      format: "yaml",
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
    expect(gr!.format).toBe("builtin-ts");
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

describe("getSkillAgentDefinitions", () => {
  it("should convert actions to AgentDefinition records", () => {
    const skills = loadAllSkills();
    const agents = getSkillAgentDefinitions(["governance-review"], skills);

    expect(agents).toHaveProperty("governance-review__summarize");
    const agent = agents["governance-review__summarize"];
    expect(agent.description).toContain("Review all open decisions");
    expect(agent.prompt).toContain("governance review assistant");
    expect(agent.maxTurns).toBe(10);
    expect(agent.tools).toBeDefined();
    expect(agent.tools!.length).toBeGreaterThan(0);
    expect(agent.tools).toContain("mcp__marvin-governance__list_decisions");
  });

  it("should return empty when skills have no actions", () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set("no-actions", {
      id: "no-actions",
      name: "No Actions",
      description: "Skill without actions",
      version: "1.0.0",
      format: "yaml",
    });

    const agents = getSkillAgentDefinitions(["no-actions"], skills);
    expect(Object.keys(agents)).toHaveLength(0);
  });

  it("should default maxTurns to 5", () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set("default-turns", {
      id: "default-turns",
      name: "Default Turns",
      description: "Test",
      version: "1.0.0",
      format: "yaml",
      actions: [
        { id: "act", name: "Act", description: "Do", systemPrompt: "Go." },
      ],
    });

    const agents = getSkillAgentDefinitions(["default-turns"], skills);
    expect(agents["default-turns__act"].maxTurns).toBe(5);
  });

  it("should pass empty tools when allowGovernanceTools is false", () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set("restricted", {
      id: "restricted",
      name: "Restricted",
      description: "Test",
      version: "1.0.0",
      format: "yaml",
      actions: [
        { id: "act", name: "Act", description: "Do", systemPrompt: "Go.", allowGovernanceTools: false },
      ],
    });

    const agents = getSkillAgentDefinitions(["restricted"], skills);
    expect(agents["restricted__act"].tools).toEqual([]);
  });

  it("should skip unknown skill IDs", () => {
    const skills = loadAllSkills();
    const agents = getSkillAgentDefinitions(["nonexistent"], skills);
    expect(Object.keys(agents)).toHaveLength(0);
  });
});
