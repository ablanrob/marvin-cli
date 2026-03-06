import type { DoctorRule, DoctorContext, DoctorIssue, DoctorFix } from "../types.js";
import { normalizeLinkedEpics, generateEpicTags } from "../../plugins/builtin/tools/task-utils.js";
import { normalizeLinkedFeatures, generateFeatureTags } from "../../plugins/builtin/tools/epic-utils.js";

const RULE_ID = "missing-auto-tags";
const RULE_NAME = "Missing Auto Tags";

export const missingAutoTagsRule: DoctorRule = {
  id: RULE_ID,
  name: RULE_NAME,
  description:
    "Ensures tasks have epic:E-xxx tags for their linkedEpic and epics have feature:F-xxx tags",

  scan(ctx: DoctorContext): DoctorIssue[] {
    const issues: DoctorIssue[] = [];

    for (const doc of ctx.allDocuments) {
      const fm = doc.frontmatter as Record<string, unknown>;
      const tags = (doc.frontmatter.tags ?? []) as string[];

      // Tasks/actions with linkedEpic should have epic:* tags
      const linkedEpics = normalizeLinkedEpics(fm.linkedEpic);
      if (linkedEpics.length > 0) {
        const expected = generateEpicTags(linkedEpics);
        const missing = expected.filter((t) => !tags.includes(t));
        for (const tag of missing) {
          issues.push({
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            documentId: doc.frontmatter.id,
            filePath: doc.filePath,
            documentType: doc.frontmatter.type,
            message: `Missing auto-tag "${tag}" for linkedEpic`,
            severity: "warning",
            fixable: true,
          });
        }
      }

      // Epics with linkedFeature should have feature:* tags
      const linkedFeatures = normalizeLinkedFeatures(fm.linkedFeature);
      if (linkedFeatures.length > 0) {
        const expected = generateFeatureTags(linkedFeatures);
        const missing = expected.filter((t) => !tags.includes(t));
        for (const tag of missing) {
          issues.push({
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            documentId: doc.frontmatter.id,
            filePath: doc.filePath,
            documentType: doc.frontmatter.type,
            message: `Missing auto-tag "${tag}" for linkedFeature`,
            severity: "warning",
            fixable: true,
          });
        }
      }
    }

    return issues;
  },

  fix(ctx: DoctorContext): DoctorFix[] {
    const fixes: DoctorFix[] = [];

    for (const doc of ctx.allDocuments) {
      const fm = doc.frontmatter as Record<string, unknown>;
      const tags = [...((doc.frontmatter.tags ?? []) as string[])];
      let changed = false;

      const linkedEpics = normalizeLinkedEpics(fm.linkedEpic);
      if (linkedEpics.length > 0) {
        const expected = generateEpicTags(linkedEpics);
        for (const tag of expected) {
          if (!tags.includes(tag)) {
            tags.push(tag);
            changed = true;
            fixes.push({
              issue: {
                ruleId: RULE_ID,
                ruleName: RULE_NAME,
                documentId: doc.frontmatter.id,
                filePath: doc.filePath,
                documentType: doc.frontmatter.type,
                message: `Missing auto-tag "${tag}" for linkedEpic`,
                severity: "warning",
                fixable: true,
              },
              fixDescription: `Added tag "${tag}"`,
            });
          }
        }
      }

      const linkedFeatures = normalizeLinkedFeatures(fm.linkedFeature);
      if (linkedFeatures.length > 0) {
        const expected = generateFeatureTags(linkedFeatures);
        for (const tag of expected) {
          if (!tags.includes(tag)) {
            tags.push(tag);
            changed = true;
            fixes.push({
              issue: {
                ruleId: RULE_ID,
                ruleName: RULE_NAME,
                documentId: doc.frontmatter.id,
                filePath: doc.filePath,
                documentType: doc.frontmatter.type,
                message: `Missing auto-tag "${tag}" for linkedFeature`,
                severity: "warning",
                fixable: true,
              },
              fixDescription: `Added tag "${tag}"`,
            });
          }
        }
      }

      if (changed) {
        ctx.store.update(doc.frontmatter.id, { tags });
      }
    }

    return fixes;
  },
};
