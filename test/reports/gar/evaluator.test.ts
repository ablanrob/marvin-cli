import { describe, it, expect } from "vitest";
import { evaluateGar } from "../../../src/reports/gar/evaluator.js";
import type { GarMetrics } from "../../../src/reports/gar/types.js";

function makeMetrics(overrides: Partial<{
  total: number;
  done: number;
  completionPct: number;
  blocked: number;
  overdue: number;
  risks: number;
  openQuestions: number;
  unowned: number;
}>): GarMetrics {
  const o = {
    total: 0,
    done: 0,
    completionPct: 100,
    blocked: 0,
    overdue: 0,
    risks: 0,
    openQuestions: 0,
    unowned: 0,
    ...overrides,
  };
  return {
    scope: { total: o.total, open: o.total - o.done, done: o.done, completionPct: o.completionPct },
    schedule: { blocked: o.blocked, overdue: o.overdue, items: [] },
    quality: { risks: o.risks, openQuestions: o.openQuestions, items: [] },
    resources: { unowned: o.unowned, items: [] },
  };
}

describe("evaluateGar", () => {
  describe("scope thresholds", () => {
    it("should be green when completion >= 70%", () => {
      const report = evaluateGar("proj", makeMetrics({ total: 10, done: 7, completionPct: 70 }));
      expect(report.areas.find((a) => a.name === "Scope")!.status).toBe("green");
    });

    it("should be amber when completion >= 40% and < 70%", () => {
      const report = evaluateGar("proj", makeMetrics({ total: 10, done: 4, completionPct: 40 }));
      expect(report.areas.find((a) => a.name === "Scope")!.status).toBe("amber");
    });

    it("should be red when completion < 40%", () => {
      const report = evaluateGar("proj", makeMetrics({ total: 10, done: 1, completionPct: 10 }));
      expect(report.areas.find((a) => a.name === "Scope")!.status).toBe("red");
    });

    it("should be green for empty project (100% by default)", () => {
      const report = evaluateGar("proj", makeMetrics({}));
      expect(report.areas.find((a) => a.name === "Scope")!.status).toBe("green");
    });
  });

  describe("schedule thresholds", () => {
    it("should be green when 0 blocked+overdue", () => {
      const report = evaluateGar("proj", makeMetrics({}));
      expect(report.areas.find((a) => a.name === "Schedule")!.status).toBe("green");
    });

    it("should be amber when <= 2 blocked+overdue", () => {
      const report = evaluateGar("proj", makeMetrics({ blocked: 1, overdue: 1 }));
      expect(report.areas.find((a) => a.name === "Schedule")!.status).toBe("amber");
    });

    it("should be red when > 2 blocked+overdue", () => {
      const report = evaluateGar("proj", makeMetrics({ blocked: 2, overdue: 1 }));
      expect(report.areas.find((a) => a.name === "Schedule")!.status).toBe("red");
    });
  });

  describe("quality thresholds", () => {
    it("should be green when 0 risks+questions", () => {
      const report = evaluateGar("proj", makeMetrics({}));
      expect(report.areas.find((a) => a.name === "Quality")!.status).toBe("green");
    });

    it("should be amber when <= 2 risks+questions", () => {
      const report = evaluateGar("proj", makeMetrics({ risks: 1, openQuestions: 1 }));
      expect(report.areas.find((a) => a.name === "Quality")!.status).toBe("amber");
    });

    it("should be red when > 2 risks+questions", () => {
      const report = evaluateGar("proj", makeMetrics({ risks: 2, openQuestions: 1 }));
      expect(report.areas.find((a) => a.name === "Quality")!.status).toBe("red");
    });
  });

  describe("resources thresholds", () => {
    it("should be green when 0 unowned", () => {
      const report = evaluateGar("proj", makeMetrics({}));
      expect(report.areas.find((a) => a.name === "Resources")!.status).toBe("green");
    });

    it("should be amber when <= 2 unowned", () => {
      const report = evaluateGar("proj", makeMetrics({ unowned: 2 }));
      expect(report.areas.find((a) => a.name === "Resources")!.status).toBe("amber");
    });

    it("should be red when > 2 unowned", () => {
      const report = evaluateGar("proj", makeMetrics({ unowned: 3 }));
      expect(report.areas.find((a) => a.name === "Resources")!.status).toBe("red");
    });
  });

  describe("overall status", () => {
    it("should be green when all areas are green", () => {
      const report = evaluateGar("proj", makeMetrics({}));
      expect(report.overall).toBe("green");
    });

    it("should be amber when worst area is amber", () => {
      const report = evaluateGar("proj", makeMetrics({ unowned: 1 }));
      expect(report.overall).toBe("amber");
    });

    it("should be red when any area is red", () => {
      const report = evaluateGar("proj", makeMetrics({ completionPct: 10, total: 10, done: 1 }));
      expect(report.overall).toBe("red");
    });
  });

  it("should include project name and date", () => {
    const report = evaluateGar("My Project", makeMetrics({}));
    expect(report.projectName).toBe("My Project");
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
