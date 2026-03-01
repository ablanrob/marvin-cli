import { describe, it, expect } from "vitest";
import { getDefaultClaudeMdContent } from "../../src/templates/claude-md.js";

describe("getDefaultClaudeMdContent", () => {
  it("should include the project name", () => {
    const content = getDefaultClaudeMdContent("My Project");
    expect(content).toContain("My Project");
  });

  it("should reference all three personas", () => {
    const content = getDefaultClaudeMdContent("test");
    expect(content).toContain("Product Owner");
    expect(content).toContain("Delivery Manager");
    expect(content).toContain("Tech Lead");
  });

  it("should reference governance artifact types", () => {
    const content = getDefaultClaudeMdContent("test");
    expect(content).toContain("Decision (D-xxx)");
    expect(content).toContain("Action (A-xxx)");
    expect(content).toContain("Question (Q-xxx)");
    expect(content).toContain("Feature (F-xxx)");
    expect(content).toContain("Epic (E-xxx)");
    expect(content).toContain("Sprint (SP-xxx)");
  });

  it("should include persona short names", () => {
    const content = getDefaultClaudeMdContent("test");
    expect(content).toContain("| po |");
    expect(content).toContain("| dm |");
    expect(content).toContain("| tl |");
  });
});
