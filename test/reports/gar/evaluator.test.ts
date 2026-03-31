import { describe, it, expect } from "vitest";
import { evaluateGar } from "../../../src/reports/gar/evaluator.js";
import type { GarMetrics } from "../../../src/reports/gar/types.js";

function makeMetrics(
  overrides: Partial<{
    atRiskItems: GarMetrics["scope"]["atRiskItems"];
    epicSummaries: GarMetrics["scope"]["epicSummaries"];
    blocked: number;
    overdue: number;
    badlyOverdueCount: number;
    riskScore: number;
    riskCount: number;
    openQuestions: number;
    staleQuestionCount: number;
    totalOpenItems: number;
  }>,
): GarMetrics {
  const o = {
    atRiskItems: [],
    epicSummaries: [],
    blocked: 0,
    overdue: 0,
    badlyOverdueCount: 0,
    riskScore: 0,
    riskCount: 0,
    openQuestions: 0,
    staleQuestionCount: 0,
    totalOpenItems: 100,
    ...overrides,
  };
  return {
    scope: { atRiskItems: o.atRiskItems, epicSummaries: o.epicSummaries },
    schedule: {
      blocked: o.blocked,
      overdue: o.overdue,
      badlyOverdueCount: o.badlyOverdueCount,
      items: [],
    },
    quality: {
      riskScore: o.riskScore,
      riskCount: o.riskCount,
      openQuestions: o.openQuestions,
      staleQuestionCount: o.staleQuestionCount,
      items: [],
      totalOpenItems: o.totalOpenItems,
    },
  };
}

describe("evaluateGar", () => {
  describe("scope thresholds", () => {
    it("should be green when no at-risk items", () => {
      const report = evaluateGar("proj", makeMetrics({}));
      expect(report.areas.find((a) => a.name === "Scope")!.status).toBe("green");
    });

    it("should be amber when there are at-risk items (not critical/high)", () => {
      const report = evaluateGar(
        "proj",
        makeMetrics({
          atRiskItems: [{ id: "A-001", title: "Test", priority: "medium", urgency: "overdue" }],
        }),
      );
      expect(report.areas.find((a) => a.name === "Scope")!.status).toBe("amber");
    });

    it("should be red when there are critical/high at-risk items", () => {
      const report = evaluateGar(
        "proj",
        makeMetrics({
          atRiskItems: [{ id: "A-001", title: "Test", priority: "critical", urgency: "overdue" }],
        }),
      );
      expect(report.areas.find((a) => a.name === "Scope")!.status).toBe("red");
    });

    it("should be red when there are high priority at-risk items", () => {
      const report = evaluateGar(
        "proj",
        makeMetrics({
          atRiskItems: [{ id: "A-001", title: "Test", priority: "high", urgency: "due-3d" }],
        }),
      );
      expect(report.areas.find((a) => a.name === "Scope")!.status).toBe("red");
    });
  });

  describe("schedule thresholds", () => {
    it("should be green when 0 blocked+overdue", () => {
      const report = evaluateGar("proj", makeMetrics({}));
      expect(report.areas.find((a) => a.name === "Schedule")!.status).toBe("green");
    });

    it("should be amber when blocked/overdue but not badly overdue", () => {
      const report = evaluateGar("proj", makeMetrics({ blocked: 1, overdue: 1 }));
      expect(report.areas.find((a) => a.name === "Schedule")!.status).toBe("amber");
    });

    it("should be red when badly overdue count > 0", () => {
      const report = evaluateGar("proj", makeMetrics({ overdue: 1, badlyOverdueCount: 1 }));
      expect(report.areas.find((a) => a.name === "Schedule")!.status).toBe("red");
    });
  });

  describe("quality thresholds", () => {
    it("should be green when score is 0", () => {
      const report = evaluateGar("proj", makeMetrics({}));
      expect(report.areas.find((a) => a.name === "Quality")!.status).toBe("green");
    });

    it("should be amber when score > 0 but below threshold", () => {
      const report = evaluateGar("proj", makeMetrics({ riskScore: 3, riskCount: 1 }));
      expect(report.areas.find((a) => a.name === "Quality")!.status).toBe("amber");
    });

    it("should be red when score > threshold (10% of totalOpenItems, min 5)", () => {
      // threshold = max(5, 100*0.1) = 10, score = 12 > 10
      const report = evaluateGar(
        "proj",
        makeMetrics({ riskScore: 10, staleQuestionCount: 2, riskCount: 3, totalOpenItems: 100 }),
      );
      expect(report.areas.find((a) => a.name === "Quality")!.status).toBe("red");
    });

    it("should use minimum threshold of 5 for small projects", () => {
      // threshold = max(5, 10*0.1) = 5, score = 6 > 5
      const report = evaluateGar(
        "proj",
        makeMetrics({ riskScore: 4, staleQuestionCount: 2, riskCount: 1, totalOpenItems: 10 }),
      );
      expect(report.areas.find((a) => a.name === "Quality")!.status).toBe("red");
    });
  });

  describe("insights", () => {
    it("should generate scope insights for at-risk items", () => {
      const report = evaluateGar(
        "proj",
        makeMetrics({
          atRiskItems: [
            { id: "A-001", title: "Test", priority: "high", urgency: "overdue" },
            { id: "A-002", title: "Test2", priority: "low", urgency: "due-3d" },
          ],
        }),
      );
      const scope = report.areas.find((a) => a.name === "Scope")!;
      expect(scope.insights).toContain("1 high-priority item(s) at risk");
      expect(scope.insights).toContain("1 additional item(s) approaching deadlines");
    });

    it("should generate green scope insight", () => {
      const report = evaluateGar("proj", makeMetrics({}));
      const scope = report.areas.find((a) => a.name === "Scope")!;
      expect(scope.insights).toContain("No at-risk items in active sprints");
    });

    it("should generate schedule insights for blocked items", () => {
      const report = evaluateGar("proj", makeMetrics({ blocked: 2, badlyOverdueCount: 1 }));
      const schedule = report.areas.find((a) => a.name === "Schedule")!;
      expect(schedule.insights).toContain("1 item(s) overdue by more than a week");
      expect(schedule.insights).toContain("2 item(s) blocked");
    });

    it("should generate quality insights for risks and stale questions", () => {
      const report = evaluateGar("proj", makeMetrics({ riskCount: 3, staleQuestionCount: 2 }));
      const quality = report.areas.find((a) => a.name === "Quality")!;
      expect(quality.insights).toContain("3 risk(s) flagged");
      expect(quality.insights).toContain("2 question(s) open for more than 2 weeks");
    });
  });

  describe("overall status", () => {
    it("should be green when all areas are green", () => {
      const report = evaluateGar("proj", makeMetrics({}));
      expect(report.overall).toBe("green");
    });

    it("should be amber when worst area is amber", () => {
      const report = evaluateGar("proj", makeMetrics({ riskScore: 1, riskCount: 1 }));
      expect(report.overall).toBe("amber");
    });

    it("should be red when any area is red", () => {
      const report = evaluateGar(
        "proj",
        makeMetrics({
          atRiskItems: [{ id: "A-001", title: "Test", priority: "critical", urgency: "overdue" }],
        }),
      );
      expect(report.overall).toBe("red");
    });
  });

  it("should include project name and date", () => {
    const report = evaluateGar("My Project", makeMetrics({}));
    expect(report.projectName).toBe("My Project");
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("should only have 3 areas (no Resources)", () => {
    const report = evaluateGar("proj", makeMetrics({}));
    expect(report.areas).toHaveLength(3);
    expect(report.areas.map((a) => a.name)).toEqual(["Scope", "Schedule", "Quality"]);
  });
});
