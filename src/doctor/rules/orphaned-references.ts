import type { DoctorRule, DoctorContext, DoctorIssue, DoctorFix } from "../types.js";

const RULE_ID = "orphaned-references";
const RULE_NAME = "Orphaned References";

const REFERENCE_FIELDS = ["aboutArtifact", "linkedEpic", "linkedFeature"];

export const orphanedReferencesRule: DoctorRule = {
  id: RULE_ID,
  name: RULE_NAME,
  description:
    "Detects references (aboutArtifact, linkedEpic, linkedFeature) pointing to non-existent documents",

  scan(ctx: DoctorContext): DoctorIssue[] {
    const issues: DoctorIssue[] = [];

    for (const doc of ctx.allDocuments) {
      const fm = doc.frontmatter as Record<string, unknown>;

      for (const field of REFERENCE_FIELDS) {
        const value = fm[field];
        if (value === undefined || value === null) continue;

        const refs = Array.isArray(value)
          ? value.filter((v): v is string => typeof v === "string")
          : typeof value === "string"
            ? [value]
            : [];

        for (const ref of refs) {
          if (!ctx.documentIndex.has(ref)) {
            issues.push({
              ruleId: RULE_ID,
              ruleName: RULE_NAME,
              documentId: doc.frontmatter.id,
              filePath: doc.filePath,
              documentType: doc.frontmatter.type,
              message: `Field "${field}" references "${ref}" which does not exist`,
              severity: "warning",
              fixable: false,
            });
          }
        }
      }
    }

    return issues;
  },

  fix(): DoctorFix[] {
    // Orphaned references are not auto-fixable — requires human judgment
    return [];
  },
};
