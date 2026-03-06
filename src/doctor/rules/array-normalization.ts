import type { DoctorRule, DoctorContext, DoctorIssue, DoctorFix } from "../types.js";
import { normalizeLinkedEpics } from "../../plugins/builtin/tools/task-utils.js";
import { normalizeLinkedFeatures } from "../../plugins/builtin/tools/epic-utils.js";

const RULE_ID = "array-normalization";
const RULE_NAME = "Array Normalization";

interface FieldConfig {
  /** The canonical field name (e.g. "linkedEpic") */
  field: string;
  /** Legacy aliases that should be renamed to the canonical field */
  aliases: string[];
  normalize: (value: unknown) => string[];
}

const FIELDS: FieldConfig[] = [
  {
    field: "linkedEpic",
    aliases: ["linkedEpics"],
    normalize: normalizeLinkedEpics,
  },
  {
    field: "linkedFeature",
    aliases: ["linkedFeatures"],
    normalize: normalizeLinkedFeatures,
  },
];

export const arrayNormalizationRule: DoctorRule = {
  id: RULE_ID,
  name: RULE_NAME,
  description:
    "Normalizes linkedEpic/linkedFeature from strings to arrays and resolves field aliases",

  scan(ctx: DoctorContext): DoctorIssue[] {
    const issues: DoctorIssue[] = [];

    for (const doc of ctx.allDocuments) {
      const fm = doc.frontmatter as Record<string, unknown>;

      for (const cfg of FIELDS) {
        // Check for alias fields (e.g. linkedEpics → linkedEpic)
        for (const alias of cfg.aliases) {
          if (fm[alias] !== undefined) {
            issues.push({
              ruleId: RULE_ID,
              ruleName: RULE_NAME,
              documentId: doc.frontmatter.id,
              filePath: doc.filePath,
              documentType: doc.frontmatter.type,
              message: `Field "${alias}" should be renamed to "${cfg.field}"`,
              severity: "warning",
              fixable: true,
            });
          }
        }

        // Check if canonical field is a string instead of array
        const value = fm[cfg.field];
        if (typeof value === "string") {
          issues.push({
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            documentId: doc.frontmatter.id,
            filePath: doc.filePath,
            documentType: doc.frontmatter.type,
            message: `Field "${cfg.field}" is a string ("${value}") but should be an array`,
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
      const updates: Record<string, unknown> = {};
      let needsUpdate = false;

      for (const cfg of FIELDS) {
        // Merge alias values into canonical field
        for (const alias of cfg.aliases) {
          if (fm[alias] !== undefined) {
            // Merge alias value into canonical field
            const aliasValues = cfg.normalize(fm[alias]);
            const existing = cfg.normalize(fm[cfg.field]);
            const merged = [...new Set([...existing, ...aliasValues])];
            updates[cfg.field] = merged;
            // gray-matter preserves extra keys; to remove the alias we set it explicitly
            updates[alias] = undefined;
            needsUpdate = true;

            fixes.push({
              issue: {
                ruleId: RULE_ID,
                ruleName: RULE_NAME,
                documentId: doc.frontmatter.id,
                filePath: doc.filePath,
                documentType: doc.frontmatter.type,
                message: `Field "${alias}" should be renamed to "${cfg.field}"`,
                severity: "warning",
                fixable: true,
              },
              fixDescription: `Merged "${alias}" into "${cfg.field}" and removed alias`,
            });
          }
        }

        // Normalize string → array (only if alias handling didn't already set it)
        const value = updates[cfg.field] ?? fm[cfg.field];
        if (typeof value === "string") {
          updates[cfg.field] = cfg.normalize(value);
          needsUpdate = true;

          fixes.push({
            issue: {
              ruleId: RULE_ID,
              ruleName: RULE_NAME,
              documentId: doc.frontmatter.id,
              filePath: doc.filePath,
              documentType: doc.frontmatter.type,
              message: `Field "${cfg.field}" is a string ("${value}") but should be an array`,
              severity: "warning",
              fixable: true,
            },
            fixDescription: `Normalized "${cfg.field}" from string to array`,
          });
        }
      }

      if (needsUpdate) {
        ctx.store.update(doc.frontmatter.id, updates as any);
      }
    }

    return fixes;
  },
};
