import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";
import { normalizeLinkedFeatures } from "../../../plugins/builtin/tools/epic-utils.js";
import { normalizeLinkedEpics } from "../../../plugins/builtin/tools/task-utils.js";

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function priorityRank(p?: string): number {
  return PRIORITY_ORDER[p ?? ""] ?? 99;
}

interface PrdContext {
  features: {
    id: string;
    title: string;
    status: string;
    priority: string;
    content: string;
    linkedEpicCount: number;
  }[];
  epics: {
    id: string;
    title: string;
    status: string;
    linkedFeature: string[];
    targetDate: string | null;
    estimatedEffort: string | null;
    content: string;
    linkedTaskCount: number;
  }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    linkedEpic: string[];
    acceptanceCriteria: string | null;
    technicalNotes: string | null;
    complexity: string | null;
    estimatedPoints: number | null;
    priority: string | null;
  }[];
  decisions: {
    id: string;
    title: string;
    status: string;
    content: string;
  }[];
  questions: {
    id: string;
    title: string;
    status: string;
    content: string;
  }[];
  actions: {
    id: string;
    title: string;
    status: string;
    owner: string | null;
    priority: string | null;
    dueDate: string | null;
  }[];
  summary: {
    totalFeatures: number;
    totalEpics: number;
    totalTasks: number;
    featuresByStatus: Record<string, number>;
    epicsByStatus: Record<string, number>;
  };
}

function gatherContext(
  store: DocumentStore,
  focusFeature?: string,
  includeDecisions = true,
  includeQuestions = true,
): PrdContext {
  const allFeatures = store.list({ type: "feature" });
  const allEpics = store.list({ type: "epic" });
  const allTasks = store.list({ type: "task" });
  const allDecisions = includeDecisions ? store.list({ type: "decision" }) : [];
  const allQuestions = includeQuestions ? store.list({ type: "question" }) : [];
  const allActions = store.list({ type: "action" });

  // Filter by focus feature if specified
  let features = allFeatures;
  let epics = allEpics;
  let tasks = allTasks;

  if (focusFeature) {
    features = features.filter((f) => f.frontmatter.id === focusFeature);
    const featureIds = new Set(features.map((f) => f.frontmatter.id));
    epics = epics.filter((e) =>
      normalizeLinkedFeatures(e.frontmatter.linkedFeature).some((id) => featureIds.has(id)),
    );
    const epicIds = new Set(epics.map((e) => e.frontmatter.id));
    tasks = tasks.filter((t) =>
      normalizeLinkedEpics(t.frontmatter.linkedEpic).some((id) => epicIds.has(id)),
    );
  }

  // Build summary
  const featuresByStatus: Record<string, number> = {};
  for (const f of features) {
    featuresByStatus[f.frontmatter.status] = (featuresByStatus[f.frontmatter.status] ?? 0) + 1;
  }
  const epicsByStatus: Record<string, number> = {};
  for (const e of epics) {
    epicsByStatus[e.frontmatter.status] = (epicsByStatus[e.frontmatter.status] ?? 0) + 1;
  }

  const epicIds = new Set(epics.map((e) => e.frontmatter.id));

  return {
    features: features
      .sort((a, b) => priorityRank(a.frontmatter.priority) - priorityRank(b.frontmatter.priority))
      .map((f) => ({
        id: f.frontmatter.id,
        title: f.frontmatter.title,
        status: f.frontmatter.status,
        priority: f.frontmatter.priority ?? "medium",
        content: f.content,
        linkedEpicCount: epics.filter((e) =>
          normalizeLinkedFeatures(e.frontmatter.linkedFeature).includes(f.frontmatter.id),
        ).length,
      })),
    epics: epics.map((e) => ({
      id: e.frontmatter.id,
      title: e.frontmatter.title,
      status: e.frontmatter.status,
      linkedFeature: normalizeLinkedFeatures(e.frontmatter.linkedFeature),
      targetDate: typeof e.frontmatter.targetDate === "string" ? e.frontmatter.targetDate : null,
      estimatedEffort:
        typeof e.frontmatter.estimatedEffort === "string" ? e.frontmatter.estimatedEffort : null,
      content: e.content,
      linkedTaskCount: tasks.filter((t) =>
        normalizeLinkedEpics(t.frontmatter.linkedEpic).includes(e.frontmatter.id),
      ).length,
    })),
    tasks: tasks.map((t) => ({
      id: t.frontmatter.id,
      title: t.frontmatter.title,
      status: t.frontmatter.status,
      linkedEpic: normalizeLinkedEpics(t.frontmatter.linkedEpic),
      acceptanceCriteria:
        typeof t.frontmatter.acceptanceCriteria === "string"
          ? t.frontmatter.acceptanceCriteria
          : null,
      technicalNotes:
        typeof t.frontmatter.technicalNotes === "string" ? t.frontmatter.technicalNotes : null,
      complexity: typeof t.frontmatter.complexity === "string" ? t.frontmatter.complexity : null,
      estimatedPoints:
        typeof t.frontmatter.estimatedPoints === "number" ? t.frontmatter.estimatedPoints : null,
      priority: t.frontmatter.priority ?? null,
    })),
    decisions: allDecisions.map((d) => ({
      id: d.frontmatter.id,
      title: d.frontmatter.title,
      status: d.frontmatter.status,
      content: d.content,
    })),
    questions: allQuestions.map((q) => ({
      id: q.frontmatter.id,
      title: q.frontmatter.title,
      status: q.frontmatter.status,
      content: q.content,
    })),
    actions: allActions
      .filter((a) => {
        if (!focusFeature) return true;
        // Include actions tagged with relevant epics
        const tags: string[] = a.frontmatter.tags ?? [];
        return tags.some((t) => t.startsWith("epic:") && epicIds.has(t.replace("epic:", "")));
      })
      .map((a) => ({
        id: a.frontmatter.id,
        title: a.frontmatter.title,
        status: a.frontmatter.status,
        owner: a.frontmatter.owner ?? null,
        priority: a.frontmatter.priority ?? null,
        dueDate: a.frontmatter.dueDate ?? null,
      })),
    summary: {
      totalFeatures: features.length,
      totalEpics: epics.length,
      totalTasks: tasks.length,
      featuresByStatus,
      epicsByStatus,
    },
  };
}

function generateTaskMasterPrd(title: string, ctx: PrdContext, projectOverview?: string): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");

  // Project Overview
  lines.push("## Project Overview");
  if (projectOverview) {
    lines.push(projectOverview);
  } else if (ctx.features.length > 0) {
    lines.push(
      `This project encompasses ${ctx.features.length} feature(s) spanning ${ctx.epics.length} epic(s) and ${ctx.tasks.length} implementation task(s).`,
    );
  }
  lines.push("");

  // Goals
  lines.push("## Goals");
  for (const f of ctx.features) {
    lines.push(`- **${f.title}** (${f.id}, Priority: ${f.priority}) — ${f.status}`);
  }
  lines.push("");

  // Features and Requirements
  lines.push("## Features and Requirements");
  lines.push("");

  for (const feature of ctx.features) {
    lines.push(`### ${feature.title} (${feature.id}) — Priority: ${feature.priority}`);
    lines.push("");
    if (feature.content) {
      lines.push(feature.content);
      lines.push("");
    }

    // Linked epics
    const featureEpics = ctx.epics.filter((e) => e.linkedFeature.includes(feature.id));
    if (featureEpics.length > 0) {
      lines.push("#### User Stories / Epics");
      lines.push("");
      for (const epic of featureEpics) {
        const effort = epic.estimatedEffort ? `, Effort: ${epic.estimatedEffort}` : "";
        lines.push(`- **${epic.id}: ${epic.title}** — Status: ${epic.status}${effort}`);
        if (epic.content) {
          lines.push(`  ${epic.content.split("\n")[0]}`);
        }

        // Linked tasks
        const epicTasks = ctx.tasks.filter((t) => t.linkedEpic.includes(epic.id));
        if (epicTasks.length > 0) {
          lines.push("");
          lines.push("#### Implementation Tasks");
          lines.push("");
          for (const task of epicTasks) {
            const complexity = task.complexity ? `, Complexity: ${task.complexity}` : "";
            const points =
              task.estimatedPoints !== null && task.estimatedPoints !== undefined
                ? `, Points: ${task.estimatedPoints}`
                : "";
            lines.push(`- **${task.id}: ${task.title}**${complexity}${points}`);
            if (task.acceptanceCriteria) {
              lines.push(`  Acceptance Criteria: ${task.acceptanceCriteria}`);
            }
          }
        }
      }
      lines.push("");
    }
  }

  // Technical Considerations
  const approvedDecisions = ctx.decisions.filter(
    (d) => d.status === "approved" || d.status === "accepted",
  );
  const openQuestions = ctx.questions.filter((q) => q.status === "open");
  const technicalNotes = ctx.tasks
    .filter((t) => t.technicalNotes)
    .map((t) => `- **${t.id}**: ${t.technicalNotes}`);

  if (approvedDecisions.length > 0 || openQuestions.length > 0 || technicalNotes.length > 0) {
    lines.push("## Technical Considerations");
    lines.push("");

    if (approvedDecisions.length > 0) {
      lines.push("### Key Decisions");
      for (const d of approvedDecisions) {
        lines.push(`- **${d.id}: ${d.title}** — ${d.content.split("\n")[0]}`);
      }
      lines.push("");
    }

    if (technicalNotes.length > 0) {
      lines.push("### Technical Notes");
      for (const note of technicalNotes) {
        lines.push(note);
      }
      lines.push("");
    }

    if (openQuestions.length > 0) {
      lines.push("### Open Questions");
      for (const q of openQuestions) {
        lines.push(`- **${q.id}: ${q.title}** — ${q.content.split("\n")[0]}`);
      }
      lines.push("");
    }
  }

  // Implementation Priorities
  lines.push("## Implementation Priorities");
  lines.push("");
  let priorityIdx = 1;
  for (const feature of ctx.features) {
    const featureEpics = ctx.epics
      .filter((e) => e.linkedFeature.includes(feature.id))
      .sort((a, b) => {
        const statusOrder: Record<string, number> = { "in-progress": 0, planned: 1, done: 2 };
        return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
      });

    if (featureEpics.length === 0) continue;

    lines.push(`${priorityIdx}. **${feature.title}** (${feature.priority})`);
    for (const epic of featureEpics) {
      const epicTasks = ctx.tasks.filter((t) => t.linkedEpic.includes(epic.id));
      lines.push(`   - ${epic.id}: ${epic.title} (${epic.status}) — ${epicTasks.length} task(s)`);
    }
    priorityIdx++;
  }
  lines.push("");

  return lines.join("\n");
}

function generateClaudeCodePrd(title: string, ctx: PrdContext, projectOverview?: string): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");

  // Overview
  lines.push("## Overview");
  if (projectOverview) {
    lines.push(projectOverview);
  } else if (ctx.features.length > 0) {
    lines.push(
      `This project encompasses ${ctx.features.length} feature(s) spanning ${ctx.epics.length} epic(s) and ${ctx.tasks.length} implementation task(s).`,
    );
  }
  lines.push("");

  // Architecture & Technical Decisions
  const approvedDecisions = ctx.decisions.filter(
    (d) => d.status === "approved" || d.status === "accepted",
  );
  if (approvedDecisions.length > 0) {
    lines.push("## Architecture & Technical Decisions");
    lines.push("");
    for (const d of approvedDecisions) {
      lines.push(`### ${d.id}: ${d.title}`);
      lines.push(d.content);
      lines.push("");
    }
  }

  // Implementation Plan — group by priority
  lines.push("## Implementation Plan");
  lines.push("");

  const priorityGroups: Record<string, typeof ctx.features> = {};
  for (const f of ctx.features) {
    const group =
      f.priority === "critical" || f.priority === "high"
        ? "Phase 1: High Priority"
        : "Phase 2: Medium & Low Priority";
    if (!priorityGroups[group]) priorityGroups[group] = [];
    priorityGroups[group].push(f);
  }

  for (const [phase, features] of Object.entries(priorityGroups)) {
    lines.push(`### ${phase}`);
    lines.push("");
    for (const feature of features) {
      const featureEpics = ctx.epics.filter((e) => e.linkedFeature.includes(feature.id));
      for (const epic of featureEpics) {
        lines.push(`- [ ] ${epic.id}: ${epic.title}`);
        const epicTasks = ctx.tasks.filter((t) => t.linkedEpic.includes(epic.id));
        for (const task of epicTasks) {
          const complexity = task.complexity ? `complexity: ${task.complexity}` : "";
          const points =
            task.estimatedPoints !== null && task.estimatedPoints !== undefined
              ? `points: ${task.estimatedPoints}`
              : "";
          const meta = [complexity, points].filter(Boolean).join(", ");
          lines.push(`  - [ ] ${task.id}: ${task.title}${meta ? ` (${meta})` : ""}`);
          if (task.acceptanceCriteria) {
            lines.push(`    - Acceptance: ${task.acceptanceCriteria}`);
          }
          if (task.technicalNotes) {
            lines.push(`    - Notes: ${task.technicalNotes}`);
          }
        }
      }
    }
    lines.push("");
  }

  // Open Questions
  const openQuestions = ctx.questions.filter((q) => q.status === "open");
  if (openQuestions.length > 0) {
    lines.push("## Open Questions");
    lines.push("");
    for (const q of openQuestions) {
      lines.push(`- **${q.id}: ${q.title}** — ${q.content.split("\n")[0]}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function createPrdTools(store: DocumentStore): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "gather_prd_context",
      "Aggregate all governance artifacts (features, epics, tasks, decisions, questions, actions) into structured JSON for PRD generation",
      {
        focusFeature: z
          .string()
          .optional()
          .describe("Filter context to a specific feature ID (e.g. 'F-001')"),
        includeDecisions: z
          .boolean()
          .optional()
          .describe("Include decisions in context (default: true)"),
        includeQuestions: z
          .boolean()
          .optional()
          .describe("Include questions in context (default: true)"),
      },
      async (args) => {
        const ctx = gatherContext(
          store,
          args.focusFeature,
          args.includeDecisions ?? true,
          args.includeQuestions ?? true,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(ctx, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "generate_prd",
      "Generate a PRD document from governance artifacts and save it as a PRD-xxx document",
      {
        title: z.string().describe("PRD title"),
        format: z
          .enum(["taskmaster", "claude-code"])
          .describe(
            "Output format: 'taskmaster' for Claude TaskMaster parse_prd, 'claude-code' for Claude Code consumption",
          ),
        projectOverview: z
          .string()
          .optional()
          .describe("Project overview text (synthesized from features if not provided)"),
        focusFeature: z
          .string()
          .optional()
          .describe("Focus on a specific feature ID (e.g. 'F-001')"),
        tags: z.array(z.string()).optional().describe("Tags for the PRD document"),
      },
      async (args) => {
        const ctx = gatherContext(store, args.focusFeature);

        const prdContent =
          args.format === "taskmaster"
            ? generateTaskMasterPrd(args.title, ctx, args.projectOverview)
            : generateClaudeCodePrd(args.title, ctx, args.projectOverview);

        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: "draft",
          format: args.format,
        };
        if (args.focusFeature) frontmatter.focusFeature = args.focusFeature;
        if (args.tags) frontmatter.tags = args.tags;

        const doc = store.create("prd", frontmatter as any, prdContent);

        return {
          content: [
            {
              type: "text" as const,
              text: `Generated PRD ${doc.frontmatter.id}: "${args.title}" (format: ${args.format}, ${ctx.summary.totalFeatures} features, ${ctx.summary.totalEpics} epics, ${ctx.summary.totalTasks} tasks)`,
            },
          ],
        };
      },
    ),

    tool(
      "export_prd",
      "Export a PRD document to a file path for external consumption (e.g. by Claude TaskMaster or Claude Code)",
      {
        prdId: z.string().describe("PRD document ID (e.g. 'PRD-001')"),
        outputPath: z.string().describe("File path to write the PRD content to"),
      },
      async (args) => {
        const doc = store.get(args.prdId);
        if (!doc) {
          return {
            content: [{ type: "text" as const, text: `PRD ${args.prdId} not found` }],
            isError: true,
          };
        }

        const outputDir = path.dirname(args.outputPath);
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(args.outputPath, doc.content, "utf-8");

        return {
          content: [
            {
              type: "text" as const,
              text: `Exported PRD ${args.prdId} to ${args.outputPath}`,
            },
          ],
        };
      },
    ),
  ];
}
