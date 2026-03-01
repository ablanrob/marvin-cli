import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function priorityRank(p?: string): number {
  return PRIORITY_ORDER[p ?? ""] ?? 99;
}

export function createSprintPlanningTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "gather_sprint_planning_context",
      "Aggregate all planning-relevant data for proposing the next sprint: approved features, backlog epics, active sprint, velocity reference, blockers, and summary stats",
      {
        focusFeature: z
          .string()
          .optional()
          .describe("Filter backlog to epics of a specific feature ID (e.g. 'F-001')"),
        sprintDurationDays: z
          .number()
          .optional()
          .describe("Expected sprint duration in days — passed through for capacity reasoning"),
      },
      async (args) => {
        const features = store.list({ type: "feature" });
        const epics = store.list({ type: "epic" });
        const sprints = store.list({ type: "sprint" });
        const questions = store.list({ type: "question", status: "open" });
        const contributions = store.list({ type: "contribution" });

        // --- approvedFeatures: sorted by priority, with epic counts by status ---
        const approvedFeatures = features
          .filter((f) => f.frontmatter.status === "approved")
          .sort((a, b) => priorityRank(a.frontmatter.priority) - priorityRank(b.frontmatter.priority))
          .map((f) => {
            const linkedEpics = epics.filter((e) => e.frontmatter.linkedFeature === f.frontmatter.id);
            const epicsByStatus: Record<string, number> = {};
            for (const e of linkedEpics) {
              epicsByStatus[e.frontmatter.status] = (epicsByStatus[e.frontmatter.status] ?? 0) + 1;
            }
            return {
              id: f.frontmatter.id,
              title: f.frontmatter.title,
              priority: f.frontmatter.priority,
              owner: f.frontmatter.owner,
              epicCount: linkedEpics.length,
              epicsByStatus,
            };
          });

        // --- backlog: epics not in any sprint and not done ---
        const assignedEpicIds = new Set<string>();
        for (const sp of sprints) {
          const linked: string[] = (sp.frontmatter.linkedEpics as string[]) ?? [];
          for (const id of linked) assignedEpicIds.add(id);
        }

        const featureMap = new Map(features.map((f) => [f.frontmatter.id, f]));

        let backlogEpics = epics.filter(
          (e) => !assignedEpicIds.has(e.frontmatter.id) && e.frontmatter.status !== "done",
        );

        if (args.focusFeature) {
          backlogEpics = backlogEpics.filter(
            (e) => e.frontmatter.linkedFeature === args.focusFeature,
          );
        }

        const backlog = backlogEpics
          .sort((a, b) => {
            const fa = featureMap.get(a.frontmatter.linkedFeature as string);
            const fb = featureMap.get(b.frontmatter.linkedFeature as string);
            return priorityRank(fa?.frontmatter.priority) - priorityRank(fb?.frontmatter.priority);
          })
          .map((e) => {
            const parent = featureMap.get(e.frontmatter.linkedFeature as string);
            return {
              id: e.frontmatter.id,
              title: e.frontmatter.title,
              status: e.frontmatter.status,
              linkedFeature: e.frontmatter.linkedFeature,
              featureTitle: parent?.frontmatter.title ?? null,
              featurePriority: parent?.frontmatter.priority ?? null,
              estimatedEffort: e.frontmatter.estimatedEffort ?? null,
              targetDate: e.frontmatter.targetDate ?? null,
            };
          });

        // --- activeSprint: current active sprint with linked epic statuses ---
        const activeSprintDoc = sprints.find((s) => s.frontmatter.status === "active") ?? null;
        let activeSprint: Record<string, unknown> | null = null;

        if (activeSprintDoc) {
          const linkedEpicIds: string[] = (activeSprintDoc.frontmatter.linkedEpics as string[]) ?? [];
          const linkedEpics = linkedEpicIds.map((epicId) => {
            const epic = store.get(epicId);
            return epic
              ? { id: epicId, title: epic.frontmatter.title, status: epic.frontmatter.status }
              : { id: epicId, title: "(not found)", status: "unknown" };
          });

          // Work items tagged with this sprint
          const allDocs = store.list();
          const sprintTag = `sprint:${activeSprintDoc.frontmatter.id}`;
          const workItems = allDocs.filter(
            (d) =>
              d.frontmatter.type !== "sprint" &&
              d.frontmatter.type !== "epic" &&
              d.frontmatter.tags?.includes(sprintTag),
          );
          const doneCount = workItems.filter(
            (d) => d.frontmatter.status === "done" || d.frontmatter.status === "resolved" || d.frontmatter.status === "closed",
          ).length;
          const completionPct = workItems.length > 0 ? Math.round((doneCount / workItems.length) * 100) : 0;

          activeSprint = {
            id: activeSprintDoc.frontmatter.id,
            title: activeSprintDoc.frontmatter.title,
            goal: activeSprintDoc.frontmatter.goal,
            startDate: activeSprintDoc.frontmatter.startDate,
            endDate: activeSprintDoc.frontmatter.endDate,
            linkedEpics,
            workItems: { total: workItems.length, done: doneCount, completionPct },
          };
        }

        // --- velocityReference: last 2 completed sprints by endDate ---
        const completedSprints = sprints
          .filter((s) => s.frontmatter.status === "completed")
          .sort((a, b) => {
            const da = a.frontmatter.endDate ?? "";
            const db = b.frontmatter.endDate ?? "";
            return da < db ? 1 : da > db ? -1 : 0; // descending
          })
          .slice(0, 2);

        const velocityReference = completedSprints.map((sp) => {
          const linkedEpicIds: string[] = (sp.frontmatter.linkedEpics as string[]) ?? [];
          const efforts: string[] = [];
          for (const epicId of linkedEpicIds) {
            const epic = store.get(epicId);
            if (epic?.frontmatter.estimatedEffort) {
              efforts.push(String(epic.frontmatter.estimatedEffort));
            }
          }

          // Work item throughput
          const allDocs = store.list();
          const sprintTag = `sprint:${sp.frontmatter.id}`;
          const workItems = allDocs.filter(
            (d) =>
              d.frontmatter.type !== "sprint" &&
              d.frontmatter.type !== "epic" &&
              d.frontmatter.tags?.includes(sprintTag),
          );

          return {
            id: sp.frontmatter.id,
            title: sp.frontmatter.title,
            startDate: sp.frontmatter.startDate,
            endDate: sp.frontmatter.endDate,
            epicCount: linkedEpicIds.length,
            efforts,
            workItemCount: workItems.length,
          };
        });

        // --- blockers: open questions + open risk/blocker contributions ---
        const openBlockerContributions = contributions.filter(
          (c) =>
            c.frontmatter.status === "open" &&
            (c.frontmatter.contributionType === "risk-finding" ||
              c.frontmatter.contributionType === "blocker-report"),
        );

        const blockers = {
          openQuestions: questions.map((q) => ({
            id: q.frontmatter.id,
            title: q.frontmatter.title,
          })),
          openRiskAndBlockerContributions: openBlockerContributions.map((c) => ({
            id: c.frontmatter.id,
            title: c.frontmatter.title,
            contributionType: c.frontmatter.contributionType,
          })),
        };

        // --- summary ---
        const totalBacklogEfforts = backlog
          .filter((e) => e.estimatedEffort !== null)
          .map((e) => String(e.estimatedEffort));

        const approvedFeaturesWithNoEpics = approvedFeatures
          .filter((f) => f.epicCount === 0)
          .map((f) => ({ id: f.id, title: f.title }));

        const now = new Date().toISOString().slice(0, 10);
        const epicsAtRisk = epics
          .filter((e) => {
            if (e.frontmatter.status === "done") return false;
            // Past targetDate
            if (e.frontmatter.targetDate && e.frontmatter.targetDate < now) return true;
            // Linked to deferred feature
            const parent = featureMap.get(e.frontmatter.linkedFeature as string);
            if (parent?.frontmatter.status === "deferred") return true;
            return false;
          })
          .map((e) => ({
            id: e.frontmatter.id,
            title: e.frontmatter.title,
            reason: e.frontmatter.targetDate && e.frontmatter.targetDate < now
              ? "past-target-date"
              : "deferred-feature",
          }));

        const plannedSprintCount = sprints.filter((s) => s.frontmatter.status === "planned").length;

        const summary = {
          totalBacklogEpics: backlog.length,
          totalBacklogEfforts,
          approvedFeaturesWithNoEpics,
          epicsAtRisk,
          plannedSprintCount,
        };

        const result = {
          approvedFeatures,
          backlog,
          activeSprint,
          velocityReference,
          blockers,
          summary,
          ...(args.sprintDurationDays !== undefined ? { sprintDurationDays: args.sprintDurationDays } : {}),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),
  ];
}
