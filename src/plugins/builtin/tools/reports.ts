import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";
import { collectGarMetrics } from "../../../reports/gar/collector.js";
import { evaluateGar } from "../../../reports/gar/evaluator.js";
import { collectHealthMetrics } from "../../../reports/health/collector.js";
import { evaluateHealth } from "../../../reports/health/evaluator.js";

export function createReportTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "generate_status_report",
      "Generate a project status report with document counts and open items",
      {},
      async () => {
        const totals = store.counts();
        const openActions = store.list({ type: "action", status: "open" });
        const completedActions = store.list({ type: "action", status: "done" });
        const pendingDecisions = store.list({ type: "decision", status: "open" });
        const openQuestions = store.list({ type: "question", status: "open" });

        const report = {
          totals,
          openActions: openActions.map((d) => ({
            id: d.frontmatter.id,
            title: d.frontmatter.title,
            owner: d.frontmatter.owner,
            priority: d.frontmatter.priority,
            dueDate: d.frontmatter.dueDate,
          })),
          completedActions: completedActions.map((d) => ({
            id: d.frontmatter.id,
            title: d.frontmatter.title,
          })),
          pendingDecisions: pendingDecisions.map((d) => ({
            id: d.frontmatter.id,
            title: d.frontmatter.title,
          })),
          openQuestions: openQuestions.map((d) => ({
            id: d.frontmatter.id,
            title: d.frontmatter.title,
          })),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "generate_risk_register",
      "Generate a risk register from project data: risk-tagged items, high-priority actions, unresolved questions, pending decisions, and unowned actions",
      {},
      async () => {
        const allDocs = store.list();
        const taggedRisks = allDocs.filter(
          (d) => d.frontmatter.tags?.includes("risk"),
        );
        const highPriorityActions = store
          .list({ type: "action", status: "open" })
          .filter((d) => d.frontmatter.priority === "high");
        const unresolvedQuestions = store.list({ type: "question", status: "open" });
        const pendingDecisions = store.list({ type: "decision", status: "open" });
        const unownedActions = store
          .list({ type: "action", status: "open" })
          .filter((d) => !d.frontmatter.owner);

        const register = {
          taggedRisks: taggedRisks.map((d) => ({
            id: d.frontmatter.id,
            title: d.frontmatter.title,
            type: d.frontmatter.type,
            status: d.frontmatter.status,
          })),
          highPriorityActions: highPriorityActions.map((d) => ({
            id: d.frontmatter.id,
            title: d.frontmatter.title,
            owner: d.frontmatter.owner,
          })),
          unresolvedQuestions: unresolvedQuestions.map((d) => ({
            id: d.frontmatter.id,
            title: d.frontmatter.title,
          })),
          pendingDecisions: pendingDecisions.map((d) => ({
            id: d.frontmatter.id,
            title: d.frontmatter.title,
          })),
          unownedActions: unownedActions.map((d) => ({
            id: d.frontmatter.id,
            title: d.frontmatter.title,
          })),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(register, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "generate_gar_report",
      "Generate a Green-Amber-Red report with metrics across scope, schedule, quality, and resources",
      {},
      async () => {
        const metrics = collectGarMetrics(store);
        const report = evaluateGar("project", metrics);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "generate_epic_progress",
      "Generate progress report grouped by epic documents (E-xxx) and legacy epic tags",
      {
        epic: z.string().optional().describe("Specific epic ID (e.g. 'E-001') or legacy epic name to filter by"),
      },
      async (args) => {
        const allDocs = store.list();
        const epicDocs = store.list({ type: "epic" });

        // Primary: group by epic documents (E-xxx)
        const epicEntries = epicDocs
          .filter((e) => !args.epic || e.frontmatter.id === args.epic)
          .map((epicDoc) => {
            const epicId = epicDoc.frontmatter.id;
            const workItems = allDocs.filter(
              (d) =>
                d.frontmatter.type !== "epic" &&
                d.frontmatter.tags?.includes(`epic:${epicId}`),
            );
            const byStatus: Record<string, number> = {};
            const byType: Record<string, number> = {};
            for (const doc of workItems) {
              byStatus[doc.frontmatter.status] = (byStatus[doc.frontmatter.status] ?? 0) + 1;
              byType[doc.frontmatter.type] = (byType[doc.frontmatter.type] ?? 0) + 1;
            }
            return {
              id: epicDoc.frontmatter.id,
              title: epicDoc.frontmatter.title,
              status: epicDoc.frontmatter.status,
              linkedFeature: epicDoc.frontmatter.linkedFeature,
              targetDate: epicDoc.frontmatter.targetDate,
              estimatedEffort: epicDoc.frontmatter.estimatedEffort,
              workItems: {
                total: workItems.length,
                byStatus,
                byType,
                items: workItems.map((d) => ({
                  id: d.frontmatter.id,
                  title: d.frontmatter.title,
                  type: d.frontmatter.type,
                  status: d.frontmatter.status,
                })),
              },
            };
          });

        // Legacy: collect epic:<name> tag groups where <name> doesn't match an E-xxx ID
        const epicIds = new Set(epicDocs.map((e) => e.frontmatter.id));
        const legacyMap = new Map<string, typeof allDocs>();
        for (const doc of allDocs) {
          const epicTags = (doc.frontmatter.tags ?? []).filter((t) =>
            t.startsWith("epic:"),
          );
          for (const tag of epicTags) {
            const epicName = tag.slice(5);
            if (epicIds.has(epicName)) continue; // skip E-xxx references
            if (args.epic && epicName !== args.epic) continue;
            if (!legacyMap.has(epicName)) legacyMap.set(epicName, []);
            legacyMap.get(epicName)!.push(doc);
          }
        }

        const legacyEpics = Array.from(legacyMap.entries()).map(([name, docs]) => {
          const byStatus: Record<string, number> = {};
          const byType: Record<string, number> = {};
          for (const doc of docs) {
            byStatus[doc.frontmatter.status] = (byStatus[doc.frontmatter.status] ?? 0) + 1;
            byType[doc.frontmatter.type] = (byType[doc.frontmatter.type] ?? 0) + 1;
          }
          return {
            name,
            total: docs.length,
            byStatus,
            byType,
            items: docs.map((d) => ({
              id: d.frontmatter.id,
              title: d.frontmatter.title,
              type: d.frontmatter.type,
              status: d.frontmatter.status,
            })),
          };
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ epics: epicEntries, legacyEpics }, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "generate_sprint_progress",
      "Generate progress report for a sprint or all sprints, showing linked epics and tagged work items",
      {
        sprint: z.string().optional().describe("Specific sprint ID (e.g. 'SP-001') or omit for all"),
      },
      async (args) => {
        const allDocs = store.list();
        const sprintDocs = store.list({ type: "sprint" });

        const sprints = sprintDocs
          .filter((s) => !args.sprint || s.frontmatter.id === args.sprint)
          .map((sprintDoc) => {
            const sprintId = sprintDoc.frontmatter.id;
            const linkedEpicIds: string[] = (sprintDoc.frontmatter.linkedEpics as string[]) ?? [];

            // Linked epics with their statuses
            const linkedEpics = linkedEpicIds.map((epicId) => {
              const epic = store.get(epicId);
              return epic
                ? { id: epicId, title: epic.frontmatter.title, status: epic.frontmatter.status }
                : { id: epicId, title: "(not found)", status: "unknown" };
            });

            // Work items tagged sprint:SP-xxx
            const workItems = allDocs.filter(
              (d) =>
                d.frontmatter.type !== "sprint" &&
                d.frontmatter.type !== "epic" &&
                d.frontmatter.tags?.includes(`sprint:${sprintId}`),
            );

            const byStatus: Record<string, number> = {};
            for (const doc of workItems) {
              byStatus[doc.frontmatter.status] = (byStatus[doc.frontmatter.status] ?? 0) + 1;
            }

            const doneCount =
              (byStatus["done"] ?? 0) +
              (byStatus["resolved"] ?? 0) +
              (byStatus["closed"] ?? 0);
            const total = workItems.length;
            const completionPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

            return {
              id: sprintDoc.frontmatter.id,
              title: sprintDoc.frontmatter.title,
              status: sprintDoc.frontmatter.status,
              goal: sprintDoc.frontmatter.goal,
              startDate: sprintDoc.frontmatter.startDate,
              endDate: sprintDoc.frontmatter.endDate,
              linkedEpics,
              workItems: {
                total,
                done: doneCount,
                completionPct,
                byStatus,
                items: workItems.map((d) => ({
                  id: d.frontmatter.id,
                  title: d.frontmatter.title,
                  type: d.frontmatter.type,
                  status: d.frontmatter.status,
                  dueDate: d.frontmatter.dueDate,
                })),
              },
            };
          });

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ sprints }, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "generate_feature_progress",
      "Generate progress report for features and their linked epics",
      {
        feature: z.string().optional().describe("Specific feature ID (e.g. 'F-001') or omit for all"),
      },
      async (args) => {
        const featureDocs = store.list({ type: "feature" });
        const epicDocs = store.list({ type: "epic" });

        const features = featureDocs
          .filter((f) => !args.feature || f.frontmatter.id === args.feature)
          .map((f) => {
            const linkedEpics = epicDocs.filter(
              (e) => e.frontmatter.linkedFeature === f.frontmatter.id,
            );
            const byStatus: Record<string, number> = {};
            for (const e of linkedEpics) {
              byStatus[e.frontmatter.status] = (byStatus[e.frontmatter.status] ?? 0) + 1;
            }
            return {
              id: f.frontmatter.id,
              title: f.frontmatter.title,
              status: f.frontmatter.status,
              priority: f.frontmatter.priority,
              owner: f.frontmatter.owner,
              epics: {
                total: linkedEpics.length,
                byStatus,
                items: linkedEpics.map((e) => ({
                  id: e.frontmatter.id,
                  title: e.frontmatter.title,
                  status: e.frontmatter.status,
                })),
              },
            };
          });

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ features }, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "generate_health_report",
      "Generate a governance health check report covering artifact completeness and process health metrics",
      {},
      async () => {
        const metrics = collectHealthMetrics(store);
        const report = evaluateHealth("project", metrics);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "save_report",
      "Save a generated report as a persistent document",
      {
        title: z.string().describe("Report title"),
        content: z.string().describe("Full report content in markdown"),
        reportType: z
          .enum(["status", "risk-register", "gar", "epic-progress", "feature-progress", "sprint-progress", "custom"])
          .describe("Type of report"),
        tags: z.array(z.string()).optional().describe("Additional tags"),
      },
      async (args) => {
        const tags = [
          `report-type:${args.reportType}`,
          ...(args.tags ?? []),
        ];
        const doc = store.create(
          "report",
          {
            title: args.title,
            status: "final",
            tags,
          },
          args.content,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Saved report ${doc.frontmatter.id}: ${doc.frontmatter.title}`,
            },
          ],
        };
      },
    ),
  ];
}
