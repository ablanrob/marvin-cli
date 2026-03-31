import type { DocumentStore } from "../storage/store.js";
import type { DoctorContext, DoctorFix, DoctorIssue, DoctorReport, DoctorRule } from "./types.js";
import { allRules } from "./rules/index.js";

export function buildDoctorContext(store: DocumentStore): DoctorContext {
  const allDocuments = store.list();
  const documentIndex = new Map(allDocuments.map((doc) => [doc.frontmatter.id, doc]));
  return { store, allDocuments, documentIndex };
}

export function runDoctorScan(store: DocumentStore, ruleFilter?: string): DoctorReport {
  const rules = resolveRules(ruleFilter);
  const ctx = buildDoctorContext(store);

  const issues = rules.flatMap((rule) => rule.scan(ctx));

  return buildReport(ctx, issues, []);
}

export function runDoctorFix(store: DocumentStore, ruleFilter?: string): DoctorReport {
  const rules = resolveRules(ruleFilter);
  let ctx = buildDoctorContext(store);

  const allIssues = rules.flatMap((rule) => rule.scan(ctx));
  const allFixes = [];

  for (const rule of rules) {
    const fixes = rule.fix(ctx);
    allFixes.push(...fixes);
    if (fixes.length > 0) {
      // Rebuild context after mutations so subsequent rules see updated state
      ctx = buildDoctorContext(store);
    }
  }

  return buildReport(ctx, allIssues, allFixes);
}

function resolveRules(ruleFilter?: string): DoctorRule[] {
  if (!ruleFilter) return allRules;
  const rule = allRules.find((r) => r.id === ruleFilter);
  if (!rule) {
    throw new Error(
      `Unknown rule: ${ruleFilter}. Available: ${allRules.map((r) => r.id).join(", ")}`,
    );
  }
  return [rule];
}

function buildReport(ctx: DoctorContext, issues: DoctorIssue[], fixes: DoctorFix[]): DoctorReport {
  const byRule: Record<string, number> = {};
  const bySeverity: Record<string, number> = { error: 0, warning: 0, info: 0 };
  let fixableIssues = 0;

  for (const issue of issues) {
    byRule[issue.ruleId] = (byRule[issue.ruleId] ?? 0) + 1;
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
    if (issue.fixable) fixableIssues++;
  }

  return {
    scannedAt: new Date().toISOString(),
    totalDocuments: ctx.allDocuments.length,
    issues,
    fixes,
    summary: {
      totalIssues: issues.length,
      fixableIssues,
      fixedIssues: fixes.length,
      byRule,
      bySeverity: bySeverity as DoctorReport["summary"]["bySeverity"],
    },
  };
}
