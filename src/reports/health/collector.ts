import type { DocumentStore } from "../../storage/store.js";
import type { Document } from "../../storage/types.js";
import type {
  HealthCategoryMetrics,
  HealthGap,
  HealthMetrics,
  HealthProcessItem,
  HealthProcessMetric,
} from "./types.js";

interface FieldCheck {
  type: string;
  openStatuses: string[];
  requiredFields: string[];
}

const FIELD_CHECKS: FieldCheck[] = [
  {
    type: "action",
    openStatuses: ["open", "in-progress"],
    requiredFields: ["owner", "priority", "dueDate", "content"],
  },
  {
    type: "decision",
    openStatuses: ["open", "proposed"],
    requiredFields: ["owner", "content"],
  },
  {
    type: "question",
    openStatuses: ["open"],
    requiredFields: ["owner", "content"],
  },
  {
    type: "feature",
    openStatuses: ["draft", "approved"],
    requiredFields: ["owner", "priority", "content"],
  },
  {
    type: "epic",
    openStatuses: ["planned", "in-progress"],
    requiredFields: ["owner", "targetDate", "estimatedEffort", "content"],
  },
  {
    type: "sprint",
    openStatuses: ["planned", "active"],
    requiredFields: ["goal", "startDate", "endDate", "linkedEpics"],
  },
];

const STALE_THRESHOLD_DAYS = 14;
const AGING_THRESHOLD_DAYS = 30;

export function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  const dateA = new Date(a);
  const dateB = new Date(b);
  return Math.floor(Math.abs(dateB.getTime() - dateA.getTime()) / msPerDay);
}

function checkMissingFields(doc: Document, requiredFields: string[]): string[] {
  const missing: string[] = [];
  for (const field of requiredFields) {
    if (field === "content") {
      if (!doc.content || doc.content.trim().length === 0) {
        missing.push("content");
      }
    } else if (field === "linkedEpics") {
      const val = doc.frontmatter[field];
      if (!Array.isArray(val) || val.length === 0) {
        missing.push(field);
      }
    } else {
      const val = doc.frontmatter[field];
      if (val === undefined || val === null || val === "") {
        missing.push(field);
      }
    }
  }
  return missing;
}

function collectCompleteness(
  store: DocumentStore,
): Record<string, HealthCategoryMetrics> {
  const result: Record<string, HealthCategoryMetrics> = {};

  for (const check of FIELD_CHECKS) {
    const allOfType = store.list({ type: check.type });
    const openDocs = allOfType.filter((d) =>
      check.openStatuses.includes(d.frontmatter.status),
    );

    const gaps: HealthGap[] = [];
    let complete = 0;

    for (const doc of openDocs) {
      const missingFields = checkMissingFields(doc, check.requiredFields);
      if (missingFields.length === 0) {
        complete++;
      } else {
        gaps.push({
          id: doc.frontmatter.id,
          title: doc.frontmatter.title,
          missingFields,
        });
      }
    }

    result[check.type] = {
      total: openDocs.length,
      complete,
      gaps,
    };
  }

  return result;
}

function collectProcess(store: DocumentStore): HealthProcessMetric {
  const today = new Date().toISOString();
  const allDocs = store.list();

  // Stale: open items not updated in >= 14 days
  const openStatuses = new Set(FIELD_CHECKS.flatMap((c) => c.openStatuses));
  const openDocs = allDocs.filter((d) => openStatuses.has(d.frontmatter.status));

  const stale: HealthProcessItem[] = [];
  for (const doc of openDocs) {
    const updated = doc.frontmatter.updated ?? doc.frontmatter.created;
    const days = daysBetween(updated, today);
    if (days >= STALE_THRESHOLD_DAYS) {
      stale.push({ id: doc.frontmatter.id, title: doc.frontmatter.title, days });
    }
  }

  // Aging actions: open actions older than 30 days
  const openActions = store
    .list({ type: "action" })
    .filter((d) => d.frontmatter.status === "open" || d.frontmatter.status === "in-progress");
  const agingActions: HealthProcessItem[] = [];
  for (const doc of openActions) {
    const days = daysBetween(doc.frontmatter.created, today);
    if (days >= AGING_THRESHOLD_DAYS) {
      agingActions.push({ id: doc.frontmatter.id, title: doc.frontmatter.title, days });
    }
  }

  // Decision velocity: avg days from created to updated for resolved decisions
  const resolvedDecisions = store
    .list({ type: "decision" })
    .filter((d) => !["open", "proposed"].includes(d.frontmatter.status));
  let decisionTotal = 0;
  for (const doc of resolvedDecisions) {
    decisionTotal += daysBetween(doc.frontmatter.created, doc.frontmatter.updated);
  }
  const decisionVelocity = {
    avgDays: resolvedDecisions.length > 0
      ? Math.round(decisionTotal / resolvedDecisions.length)
      : 0,
    count: resolvedDecisions.length,
  };

  // Question resolution: avg days from created to updated for answered questions
  const answeredQuestions = store
    .list({ type: "question" })
    .filter((d) => d.frontmatter.status !== "open");
  let questionTotal = 0;
  for (const doc of answeredQuestions) {
    questionTotal += daysBetween(doc.frontmatter.created, doc.frontmatter.updated);
  }
  const questionResolution = {
    avgDays: answeredQuestions.length > 0
      ? Math.round(questionTotal / answeredQuestions.length)
      : 0,
    count: answeredQuestions.length,
  };

  return { stale, agingActions, decisionVelocity, questionResolution };
}

export function collectHealthMetrics(store: DocumentStore): HealthMetrics {
  return {
    completeness: collectCompleteness(store),
    process: collectProcess(store),
  };
}
