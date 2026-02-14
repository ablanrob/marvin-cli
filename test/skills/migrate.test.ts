import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import matter from "gray-matter";
import { migrateYamlToSkillMd, loadSkillFromDirectory } from "../../src/skills/registry.js";

describe("migrateYamlToSkillMd", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-migrate-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should convert a full YAML skill to SKILL.md directory", () => {
    const yamlSkill = {
      id: "test-skill",
      name: "Test Skill",
      description: "A test skill",
      version: "2.0.0",
      personas: ["delivery-manager", "product-owner"],
      promptFragments: {
        "*": "Wildcard prompt for all.",
        "delivery-manager": "DM-specific prompt.",
        "product-owner": "PO-specific prompt.",
      },
      actions: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Run analysis",
          systemPrompt: "Analyze everything.",
          maxTurns: 8,
        },
      ],
    };
    const yamlPath = path.join(tmpDir, "test-skill.yaml");
    fs.writeFileSync(yamlPath, YAML.stringify(yamlSkill), "utf-8");

    const outputDir = path.join(tmpDir, "test-skill");
    migrateYamlToSkillMd(yamlPath, outputDir);

    // SKILL.md exists with correct frontmatter
    const skillMdPath = path.join(outputDir, "SKILL.md");
    expect(fs.existsSync(skillMdPath)).toBe(true);
    const { data, content } = matter(fs.readFileSync(skillMdPath, "utf-8"));
    expect(data.name).toBe("test-skill");
    expect(data.description).toBe("A test skill");
    expect(data.metadata.version).toBe("2.0.0");
    expect(data.metadata.personas).toEqual(["delivery-manager", "product-owner"]);
    expect(content.trim()).toBe("Wildcard prompt for all.");

    // Persona files
    expect(fs.existsSync(path.join(outputDir, "personas", "delivery-manager.md"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "personas", "product-owner.md"))).toBe(true);
    expect(fs.readFileSync(path.join(outputDir, "personas", "delivery-manager.md"), "utf-8")).toBe("DM-specific prompt.\n");
    expect(fs.readFileSync(path.join(outputDir, "personas", "product-owner.md"), "utf-8")).toBe("PO-specific prompt.\n");

    // Actions
    expect(fs.existsSync(path.join(outputDir, "actions.yaml"))).toBe(true);
    const actions = YAML.parse(fs.readFileSync(path.join(outputDir, "actions.yaml"), "utf-8"));
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe("analyze");
    expect(actions[0].maxTurns).toBe(8);
  });

  it("should produce an equivalent SkillDefinition when reloaded", () => {
    const yamlSkill = {
      id: "roundtrip",
      name: "Roundtrip Skill",
      description: "Test roundtrip",
      version: "1.0.0",
      personas: ["tech-lead"],
      promptFragments: {
        "*": "Generic prompt.",
        "tech-lead": "TL prompt.",
      },
      actions: [
        {
          id: "run",
          name: "Run",
          description: "Execute",
          systemPrompt: "Go.",
          maxTurns: 5,
        },
      ],
    };
    const yamlPath = path.join(tmpDir, "roundtrip.yaml");
    fs.writeFileSync(yamlPath, YAML.stringify(yamlSkill), "utf-8");

    const outputDir = path.join(tmpDir, "roundtrip");
    migrateYamlToSkillMd(yamlPath, outputDir);

    const reloaded = loadSkillFromDirectory(outputDir);
    expect(reloaded).toBeDefined();
    expect(reloaded!.id).toBe("roundtrip");
    expect(reloaded!.description).toBe("Test roundtrip");
    expect(reloaded!.version).toBe("1.0.0");
    expect(reloaded!.format).toBe("skill-md");
    expect(reloaded!.personas).toEqual(["tech-lead"]);
    expect(reloaded!.promptFragments?.["*"]).toBe("Generic prompt.");
    expect(reloaded!.promptFragments?.["tech-lead"]).toBe("TL prompt.");
    expect(reloaded!.actions).toHaveLength(1);
    expect(reloaded!.actions![0].id).toBe("run");
    expect(reloaded!.actions![0].systemPrompt).toBe("Go.");
  });

  it("should handle YAML without prompt fragments", () => {
    const yamlSkill = {
      id: "no-prompts",
      name: "No Prompts",
      description: "No prompt fragments",
      version: "1.0.0",
    };
    const yamlPath = path.join(tmpDir, "no-prompts.yaml");
    fs.writeFileSync(yamlPath, YAML.stringify(yamlSkill), "utf-8");

    const outputDir = path.join(tmpDir, "no-prompts");
    migrateYamlToSkillMd(yamlPath, outputDir);

    expect(fs.existsSync(path.join(outputDir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "personas"))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, "actions.yaml"))).toBe(false);
  });

  it("should handle YAML without actions", () => {
    const yamlSkill = {
      id: "no-actions",
      name: "No Actions",
      description: "No actions",
      version: "1.0.0",
      promptFragments: { "*": "Some prompt." },
    };
    const yamlPath = path.join(tmpDir, "no-actions.yaml");
    fs.writeFileSync(yamlPath, YAML.stringify(yamlSkill), "utf-8");

    const outputDir = path.join(tmpDir, "no-actions");
    migrateYamlToSkillMd(yamlPath, outputDir);

    expect(fs.existsSync(path.join(outputDir, "actions.yaml"))).toBe(false);
    const { content } = matter(fs.readFileSync(path.join(outputDir, "SKILL.md"), "utf-8"));
    expect(content.trim()).toBe("Some prompt.");
  });

  it("should throw for YAML missing required fields", () => {
    const yamlPath = path.join(tmpDir, "broken.yaml");
    fs.writeFileSync(yamlPath, YAML.stringify({ description: "no id or name" }), "utf-8");

    expect(() => {
      migrateYamlToSkillMd(yamlPath, path.join(tmpDir, "broken"));
    }).toThrow("Invalid skill YAML");
  });
});
