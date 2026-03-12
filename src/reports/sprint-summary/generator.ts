import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SprintSummaryData } from "./types.js";

export async function generateSprintSummary(
  data: SprintSummaryData,
  personaSystemPrompt?: string,
): Promise<string> {
  const prompt = buildPrompt(data);
  const systemPrompt = personaSystemPrompt
    ? `${SYSTEM_PROMPT}\n\nAdditional persona context:\n${personaSystemPrompt}`
    : SYSTEM_PROMPT;

  const result = query({
    prompt,
    options: {
      systemPrompt,
      maxTurns: 1,
      tools: [],
      allowedTools: [],
    },
  });

  for await (const msg of result) {
    if (msg.type === "assistant") {
      const text = msg.message.content.find(
        (b: { type: string }): b is { type: "text"; text: string } =>
          b.type === "text",
      );
      if (text) return text.text;
    }
  }

  return "Unable to generate sprint summary.";
}

const SYSTEM_PROMPT = `You are a delivery management assistant generating a sprint summary narrative. Produce a concise, insightful markdown report. Do NOT include a top-level heading — the caller will add one. Use the following structure:

## Sprint Health
One-line verdict on overall sprint health (healthy / at risk / behind).

## Goal Progress
How close the team is to achieving the sprint goal. Reference the goal text and completion metrics.

## Key Achievements
Notable completions, decisions made, meetings held during the sprint. Use bullet points.

## Current Risks
Blockers, overdue items, unresolved questions, items without owners. Use bullet points. If none, say so.

## Outcome Projection
Given the current pace and time remaining, what's the likely outcome? Will the sprint goal be met?

Be specific — reference artifact IDs, dates, and numbers from the data. Keep the tone professional but direct.`;

function buildPrompt(data: SprintSummaryData): string {
  const sections: string[] = [];

  // Sprint metadata
  sections.push(`# Sprint: ${data.sprint.id} — ${data.sprint.title}`);
  sections.push(`Status: ${data.sprint.status}`);
  if (data.sprint.goal) sections.push(`Goal: ${data.sprint.goal}`);
  if (data.sprint.startDate) sections.push(`Start: ${data.sprint.startDate}`);
  if (data.sprint.endDate) sections.push(`End: ${data.sprint.endDate}`);

  // Timeline
  sections.push(`\n## Timeline`);
  sections.push(`Days elapsed: ${data.timeline.daysElapsed} / ${data.timeline.totalDays}`);
  sections.push(`Days remaining: ${data.timeline.daysRemaining}`);
  sections.push(`Timeline progress: ${data.timeline.percentComplete}%`);

  // Work items
  sections.push(`\n## Work Items`);
  sections.push(`Total: ${data.workItems.total}, Done: ${data.workItems.done}, In Progress: ${data.workItems.inProgress}, Open: ${data.workItems.open}, Blocked: ${data.workItems.blocked}`);
  sections.push(`Completion: ${data.workItems.completionPct}%`);

  if (Object.keys(data.workItems.byType).length > 0) {
    sections.push(`By type: ${Object.entries(data.workItems.byType).map(([t, n]) => `${t}: ${n}`).join(", ")}`);
  }

  // Linked epics
  if (data.linkedEpics.length > 0) {
    sections.push(`\n## Linked Epics`);
    for (const e of data.linkedEpics) {
      sections.push(`- ${e.id}: ${e.title} [${e.status}] — ${e.tasksDone}/${e.tasksTotal} tasks done`);
    }
  }

  // Meetings
  if (data.meetings.length > 0) {
    sections.push(`\n## Meetings During Sprint`);
    for (const m of data.meetings) {
      sections.push(`- ${m.date}: ${m.id} — ${m.title}`);
    }
  }

  // Recent artifacts
  if (data.artifacts.length > 0) {
    sections.push(`\n## Artifacts Created/Updated During Sprint`);
    for (const a of data.artifacts.slice(0, 20)) {
      sections.push(`- ${a.date}: ${a.id} (${a.type}) ${a.action} — ${a.title}`);
    }
    if (data.artifacts.length > 20) {
      sections.push(`... and ${data.artifacts.length - 20} more`);
    }
  }

  // Open actions
  if (data.openActions.length > 0) {
    sections.push(`\n## Open Actions`);
    for (const a of data.openActions) {
      const owner = a.owner ?? "unowned";
      const due = a.dueDate ?? "no due date";
      sections.push(`- ${a.id}: ${a.title} (${owner}, ${due})`);
    }
  }

  // Open questions
  if (data.openQuestions.length > 0) {
    sections.push(`\n## Open Questions`);
    for (const q of data.openQuestions) {
      sections.push(`- ${q.id}: ${q.title}`);
    }
  }

  // Blockers
  if (data.blockers.length > 0) {
    sections.push(`\n## Blockers`);
    for (const b of data.blockers) {
      sections.push(`- ${b.id} (${b.type}): ${b.title}`);
    }
  }

  // Risks
  if (data.risks.length > 0) {
    sections.push(`\n## Risks`);
    for (const r of data.risks) {
      sections.push(`- ${r.id} (${r.type}): ${r.title}`);
    }
  }

  // Velocity
  if (data.velocity) {
    sections.push(`\n## Velocity`);
    sections.push(`Current sprint completion rate: ${data.velocity.currentCompletionRate}%`);
    if (data.velocity.previousSprintRate !== undefined) {
      sections.push(`Previous sprint (${data.velocity.previousSprintId}): ${data.velocity.previousSprintRate}%`);
    }
  }

  return sections.join("\n");
}
