import { describe, it, expect } from "vitest";
import { renderConfluence } from "../../../src/reports/gar/render-confluence.js";
import type { GarReport } from "../../../src/reports/gar/types.js";

function makeReport(): GarReport {
  return {
    projectName: "Test Project",
    generatedAt: "2026-02-21",
    overall: "amber",
    areas: [
      {
        name: "Scope",
        status: "green",
        summary: "75% complete (3/4)",
        items: [],
      },
      {
        name: "Schedule",
        status: "amber",
        summary: "1 blocked",
        items: [{ id: "A-004", title: "Deploy" }],
      },
      {
        name: "Quality",
        status: "green",
        summary: "no issues",
        items: [],
      },
      {
        name: "Resources",
        status: "green",
        summary: "all assigned",
        items: [],
      },
    ],
    metrics: {} as any,
  };
}

describe("renderConfluence", () => {
  it("should include markdown table headers", () => {
    const output = renderConfluence(makeReport());
    expect(output).toContain("| Area | Status | Summary |");
    expect(output).toContain("|------|--------|---------|");
  });

  it("should include emoji status codes", () => {
    const output = renderConfluence(makeReport());
    expect(output).toContain(":green_circle:");
    expect(output).toContain(":yellow_circle:");
  });

  it("should include area rows in table", () => {
    const output = renderConfluence(makeReport());
    expect(output).toContain("| Scope | :green_circle: GREEN | 75% complete (3/4) |");
    expect(output).toContain("| Schedule | :yellow_circle: AMBER | 1 blocked |");
  });

  it("should include bullet-list details for areas with items", () => {
    const output = renderConfluence(makeReport());
    expect(output).toContain("## Schedule");
    expect(output).toContain("- **A-004** Deploy");
  });

  it("should not include detail section for areas with no items", () => {
    const output = renderConfluence(makeReport());
    expect(output).not.toContain("## Scope");
    expect(output).not.toContain("## Quality");
    expect(output).not.toContain("## Resources");
  });

  it("should include overall status", () => {
    const output = renderConfluence(makeReport());
    expect(output).toContain(":yellow_circle: AMBER");
  });
});
