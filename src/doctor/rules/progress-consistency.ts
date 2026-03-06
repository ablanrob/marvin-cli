import type { DoctorRule, DoctorContext, DoctorIssue, DoctorFix } from "../types.js";

const RULE_ID = "progress-consistency";
const RULE_NAME = "Progress Consistency";

export const progressConsistencyRule: DoctorRule = {
  id: RULE_ID,
  name: RULE_NAME,
  description:
    "Detects done-status documents with progress != 100 and progressOverride:true without a progress value",

  scan(ctx: DoctorContext): DoctorIssue[] {
    const issues: DoctorIssue[] = [];

    for (const doc of ctx.allDocuments) {
      const fm = doc.frontmatter as Record<string, unknown>;
      const status = doc.frontmatter.status;
      const progress = fm.progress as number | undefined;
      const progressOverride = fm.progressOverride as boolean | undefined;

      // Done status but progress not 100
      if (status === "done" && progress !== undefined && progress !== 100) {
        issues.push({
          ruleId: RULE_ID,
          ruleName: RULE_NAME,
          documentId: doc.frontmatter.id,
          filePath: doc.filePath,
          documentType: doc.frontmatter.type,
          message: `Status is "done" but progress is ${progress} (expected 100)`,
          severity: "error",
          fixable: true,
        });
      }

      // progressOverride: true but no progress value
      if (progressOverride === true && progress === undefined) {
        issues.push({
          ruleId: RULE_ID,
          ruleName: RULE_NAME,
          documentId: doc.frontmatter.id,
          filePath: doc.filePath,
          documentType: doc.frontmatter.type,
          message: `progressOverride is true but no progress value is set`,
          severity: "warning",
          fixable: true,
        });
      }
    }

    return issues;
  },

  fix(ctx: DoctorContext): DoctorFix[] {
    const fixes: DoctorFix[] = [];

    for (const doc of ctx.allDocuments) {
      const fm = doc.frontmatter as Record<string, unknown>;
      const status = doc.frontmatter.status;
      const progress = fm.progress as number | undefined;
      const progressOverride = fm.progressOverride as boolean | undefined;

      if (status === "done" && progress !== undefined && progress !== 100) {
        ctx.store.update(doc.frontmatter.id, { progress: 100 } as any);
        fixes.push({
          issue: {
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            documentId: doc.frontmatter.id,
            filePath: doc.filePath,
            documentType: doc.frontmatter.type,
            message: `Status is "done" but progress is ${progress} (expected 100)`,
            severity: "error",
            fixable: true,
          },
          fixDescription: `Set progress to 100`,
        });
      }

      if (progressOverride === true && progress === undefined) {
        ctx.store.update(doc.frontmatter.id, { progressOverride: false } as any);
        fixes.push({
          issue: {
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            documentId: doc.frontmatter.id,
            filePath: doc.filePath,
            documentType: doc.frontmatter.type,
            message: `progressOverride is true but no progress value is set`,
            severity: "warning",
            fixable: true,
          },
          fixDescription: `Set progressOverride to false`,
        });
      }
    }

    return fixes;
  },
};
