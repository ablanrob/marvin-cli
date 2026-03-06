import type { DoctorRule, DoctorContext, DoctorIssue, DoctorFix } from "../types.js";

const RULE_ID = "tag-migration";
const RULE_NAME = "Tag Migration";

export const tagMigrationRule: DoctorRule = {
  id: RULE_ID,
  name: RULE_NAME,
  description: "Detects deprecated stream:* tags and replaces them with focus:*",

  scan(ctx: DoctorContext): DoctorIssue[] {
    const issues: DoctorIssue[] = [];

    for (const doc of ctx.allDocuments) {
      const tags = doc.frontmatter.tags;
      if (!Array.isArray(tags)) continue;

      const streamTags = tags.filter((t) => t.startsWith("stream:"));
      for (const tag of streamTags) {
        issues.push({
          ruleId: RULE_ID,
          ruleName: RULE_NAME,
          documentId: doc.frontmatter.id,
          filePath: doc.filePath,
          documentType: doc.frontmatter.type,
          message: `Deprecated tag "${tag}" should be "${tag.replace("stream:", "focus:")}"`,
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
      const tags = doc.frontmatter.tags;
      if (!Array.isArray(tags)) continue;

      const streamTags = tags.filter((t) => t.startsWith("stream:"));
      if (streamTags.length === 0) continue;

      const newTags = tags.map((t) =>
        t.startsWith("stream:") ? t.replace("stream:", "focus:") : t,
      );

      ctx.store.update(doc.frontmatter.id, { tags: newTags });

      for (const tag of streamTags) {
        fixes.push({
          issue: {
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            documentId: doc.frontmatter.id,
            filePath: doc.filePath,
            documentType: doc.frontmatter.type,
            message: `Deprecated tag "${tag}" should be "${tag.replace("stream:", "focus:")}"`,
            severity: "warning",
            fixable: true,
          },
          fixDescription: `Renamed "${tag}" to "${tag.replace("stream:", "focus:")}"`,
        });
      }
    }

    return fixes;
  },
};
