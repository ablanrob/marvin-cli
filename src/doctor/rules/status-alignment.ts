import type { DoctorRule, DoctorContext, DoctorIssue, DoctorFix } from "../types.js";
import {
  FEATURE_STATUSES,
  EPIC_STATUSES,
  TASK_STATUSES,
  SPRINT_STATUSES,
  ACTION_STATUSES,
  MEETING_STATUSES,
  DECISION_STATUSES,
  QUESTION_STATUSES,
} from "../../core/statuses.js";

const RULE_ID = "status-alignment";
const RULE_NAME = "Status Alignment";

/** Canonical status sets per artifact type. */
const VALID_STATUSES: Record<string, ReadonlySet<string>> = {
  feature: new Set(FEATURE_STATUSES),
  epic: new Set(EPIC_STATUSES),
  task: new Set(TASK_STATUSES),
  sprint: new Set(SPRINT_STATUSES),
  action: new Set(ACTION_STATUSES),
  meeting: new Set(MEETING_STATUSES),
  decision: new Set(DECISION_STATUSES),
  question: new Set(QUESTION_STATUSES),
};

/**
 * Maps legacy/non-canonical statuses to their canonical replacements.
 * Only statuses with a clear, unambiguous mapping are included.
 */
const MIGRATION_MAP: Record<string, Record<string, string>> = {
  action: {
    blocked: "in-progress",
    closed: "done",
    resolved: "done",
    cancelled: "done",
    draft: "open",
  },
  decision: {
    dismissed: "superseded",
    closed: "decided",
    resolved: "decided",
    done: "decided",
  },
  question: {
    closed: "answered",
    resolved: "answered",
    done: "answered",
  },
  feature: {
    deferred: "draft",
    open: "draft",
    "in-progress": "approved",
    closed: "done",
    resolved: "done",
  },
  epic: {
    open: "planned",
    draft: "planned",
    blocked: "in-progress",
    closed: "done",
    resolved: "done",
  },
  task: {
    open: "backlog",
    draft: "backlog",
    blocked: "in-progress",
    closed: "done",
    resolved: "done",
    cancelled: "done",
  },
  sprint: {
    cancelled: "completed",
    done: "completed",
    closed: "completed",
    active: "active",
  },
  meeting: {
    open: "scheduled",
    planned: "scheduled",
    done: "completed",
    closed: "completed",
  },
};

function isValidStatus(type: string, status: string): boolean {
  const valid = VALID_STATUSES[type];
  if (!valid) return true; // Unknown type — skip
  return valid.has(status);
}

function getSuggestedStatus(type: string, status: string): string | undefined {
  return MIGRATION_MAP[type]?.[status];
}

export const statusAlignmentRule: DoctorRule = {
  id: RULE_ID,
  name: RULE_NAME,
  description:
    "Detects artifacts with non-canonical statuses and aligns them to the defined status lists",

  scan(ctx: DoctorContext): DoctorIssue[] {
    const issues: DoctorIssue[] = [];

    for (const doc of ctx.allDocuments) {
      const type = doc.frontmatter.type;
      const status = doc.frontmatter.status;
      if (!status || !VALID_STATUSES[type]) continue;

      if (!isValidStatus(type, status)) {
        const suggested = getSuggestedStatus(type, status);
        const fixable = suggested !== undefined;
        const validList = [...(VALID_STATUSES[type] ?? [])].join(", ");
        const suggestion = suggested ? ` (suggested: "${suggested}")` : "";

        issues.push({
          ruleId: RULE_ID,
          ruleName: RULE_NAME,
          documentId: doc.frontmatter.id,
          filePath: doc.filePath,
          documentType: type,
          message: `Status "${status}" is not canonical for ${type}. Valid: [${validList}]${suggestion}`,
          severity: "warning",
          fixable,
        });
      }
    }

    return issues;
  },

  fix(ctx: DoctorContext): DoctorFix[] {
    const fixes: DoctorFix[] = [];

    for (const doc of ctx.allDocuments) {
      const type = doc.frontmatter.type;
      const status = doc.frontmatter.status;
      if (!status || !VALID_STATUSES[type]) continue;
      if (isValidStatus(type, status)) continue;

      const suggested = getSuggestedStatus(type, status);
      if (!suggested) continue;

      ctx.store.update(doc.frontmatter.id, { status: suggested });

      fixes.push({
        issue: {
          ruleId: RULE_ID,
          ruleName: RULE_NAME,
          documentId: doc.frontmatter.id,
          filePath: doc.filePath,
          documentType: type,
          message: `Status "${status}" is not canonical for ${type}`,
          severity: "warning",
          fixable: true,
        },
        fixDescription: `Changed status "${status}" → "${suggested}"`,
      });
    }

    return fixes;
  },
};
