import { describe, it, expect } from "vitest";
import { renderAscii } from "../../../src/reports/gar/render-ascii.js";
import type { GarReport } from "../../../src/reports/gar/types.js";

function makeReport(): GarReport {
  return {
    projectName: "Test Project",
    generatedAt: "2026-02-21",
    overall: "red",
    areas: [
      {
        name: "Scope",
        status: "red",
        summary: "25% complete (1/4)",
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
        status: "red",
        summary: "2 risk(s), 1 open question(s)",
        items: [
          { id: "A-001", title: "Build API" },
          { id: "Q-001", title: "Which DB?" },
        ],
      },
      {
        name: "Resources",
        status: "amber",
        summary: "2 unowned action(s)",
        items: [
          { id: "A-002", title: "Write tests" },
          { id: "A-004", title: "Deploy" },
        ],
      },
    ],
    metrics: {} as any,
  };
}

describe("renderAscii", () => {
  it("should include project name", () => {
    const output = renderAscii(makeReport());
    expect(output).toContain("Test Project");
  });

  it("should include area names", () => {
    const output = renderAscii(makeReport());
    expect(output).toContain("Scope");
    expect(output).toContain("Schedule");
    expect(output).toContain("Quality");
    expect(output).toContain("Resources");
  });

  it("should include flagged item IDs", () => {
    const output = renderAscii(makeReport());
    expect(output).toContain("A-004");
    expect(output).toContain("A-001");
    expect(output).toContain("Q-001");
    expect(output).toContain("A-002");
  });

  it("should include summaries", () => {
    const output = renderAscii(makeReport());
    expect(output).toContain("25% complete (1/4)");
    expect(output).toContain("1 blocked");
    expect(output).toContain("2 unowned action(s)");
  });

  it("should include date", () => {
    const output = renderAscii(makeReport());
    expect(output).toContain("2026-02-21");
  });
});
