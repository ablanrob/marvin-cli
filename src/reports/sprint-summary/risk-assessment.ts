import { query } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../storage/store.js";
import type { SprintSummaryData } from "./types.js";

const SYSTEM_PROMPT = `You are a delivery management assistant generating a data-driven risk assessment.

IMPORTANT: All the data you need is provided in the user message below. Do NOT attempt to look up, search for, or request additional information. Analyze ONLY the data given and produce your assessment immediately.

Produce a concise markdown assessment with these sections:

## Status Assessment
One-line verdict: is this risk actively being mitigated, stalled, or escalating?

## Related Activity
What actions, decisions, or contributions are connected to this risk? How are they progressing? Be specific — reference artifact IDs from the data provided.

## Trajectory
Based on the data (status of related items, time remaining, ownership), is this risk trending toward resolution or toward becoming a blocker? Explain your reasoning with concrete evidence.

## Recommendation
One concrete next step to move this risk toward resolution.

Rules:
- Reference artifact IDs, dates, owners, and statuses from the provided data
- Keep the tone professional and direct
- Do NOT speculate beyond what the data supports — if information is insufficient, say so explicitly
- Do NOT ask for more information or say you will look things up — everything you need is in the prompt
- Produce the full assessment text directly`;

export async function generateRiskAssessment(
  data: SprintSummaryData,
  riskId: string,
  store: DocumentStore,
): Promise<string> {
  const risk = data.risks.find((r) => r.id === riskId);
  if (!risk) return "Risk not found in sprint data.";

  const prompt = buildSingleRiskPrompt(data, risk, store);

  const result = query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: 1,
      tools: [],
      allowedTools: [],
    },
  });

  for await (const msg of result) {
    if (msg.type === "assistant") {
      const text = msg.message.content.find(
        (b: { type: string }): b is { type: "text"; text: string } => b.type === "text",
      );
      if (text) return text.text;
    }
  }

  return "Unable to generate risk assessment.";
}

function buildSingleRiskPrompt(
  data: SprintSummaryData,
  risk: { id: string; title: string; type: string },
  store: DocumentStore,
): string {
  const sections: string[] = [];

  // Sprint context
  sections.push(`# Sprint: ${data.sprint.id} — ${data.sprint.title}`);
  if (data.sprint.goal) sections.push(`Goal: ${data.sprint.goal}`);
  sections.push(`Days remaining: ${data.timeline.daysRemaining} / ${data.timeline.totalDays}`);
  sections.push(`Completion: ${data.workItems.completionPct}%`);
  sections.push("");

  // Risk details
  const doc = store.get(risk.id);
  sections.push(`# RISK: ${risk.id} — ${risk.title}`);
  sections.push(`Type: ${risk.type}`);

  if (doc) {
    sections.push(`Status: ${doc.frontmatter.status}`);
    if (doc.frontmatter.owner) sections.push(`Owner: ${doc.frontmatter.owner}`);
    if (doc.frontmatter.assignee) sections.push(`Assignee: ${doc.frontmatter.assignee}`);
    if (doc.frontmatter.priority) sections.push(`Priority: ${doc.frontmatter.priority}`);
    if (doc.frontmatter.dueDate) sections.push(`Due date: ${doc.frontmatter.dueDate}`);
    if (doc.frontmatter.created) sections.push(`Created: ${doc.frontmatter.created.slice(0, 10)}`);

    const tags = (doc.frontmatter.tags as string[]) ?? [];
    if (tags.length > 0) sections.push(`Tags: ${tags.join(", ")}`);

    if (doc.content.trim()) {
      sections.push(`\nDescription:\n${doc.content.trim()}`);
    }

    // Find related documents by various heuristics
    const allDocs = store.list();
    const relatedIds = new Set<string>();

    // 1. Documents that reference this risk via aboutArtifact
    for (const d of allDocs) {
      if (d.frontmatter.aboutArtifact === risk.id) {
        relatedIds.add(d.frontmatter.id);
      }
    }

    // 2. Documents mentioned in the risk content (ID patterns like A-XXX, D-XXX, etc.)
    const idPattern = /\b([A-Z]-\d{3,})\b/g;
    let match;
    while ((match = idPattern.exec(doc.content)) !== null) {
      relatedIds.add(match[1]);
    }

    // 3. Documents sharing the same non-generic tags
    const significantTags = tags.filter(
      (t) => !t.startsWith("sprint:") && !t.startsWith("focus:") && t !== "risk",
    );
    if (significantTags.length > 0) {
      for (const d of allDocs) {
        if (d.frontmatter.id === risk.id) continue;
        const dTags = (d.frontmatter.tags as string[]) ?? [];
        if (significantTags.some((t) => dTags.includes(t))) {
          relatedIds.add(d.frontmatter.id);
        }
      }
    }

    // 4. If this risk has aboutArtifact, include parent and siblings
    const about = doc.frontmatter.aboutArtifact as string | undefined;
    if (about) {
      relatedIds.add(about);
      for (const d of allDocs) {
        if (d.frontmatter.aboutArtifact === about && d.frontmatter.id !== risk.id) {
          relatedIds.add(d.frontmatter.id);
        }
      }
    }

    // Emit related documents (cap at 20 to keep prompt manageable)
    const relatedDocs = [...relatedIds]
      .map((id) => store.get(id))
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .slice(0, 20);

    if (relatedDocs.length > 0) {
      sections.push(`\n## Related Documents (${relatedDocs.length})`);
      for (const rd of relatedDocs) {
        const owner = rd.frontmatter.owner ?? "unowned";
        const summary = rd.content.trim().slice(0, 300);
        sections.push(
          `- ${rd.frontmatter.id} (${rd.frontmatter.type}) [${rd.frontmatter.status}] — ${rd.frontmatter.title}`,
        );
        sections.push(
          `  Owner: ${owner}${rd.frontmatter.dueDate ? `, Due: ${rd.frontmatter.dueDate}` : ""}`,
        );
        if (summary)
          sections.push(`  Summary: ${summary}${rd.content.trim().length > 300 ? "..." : ""}`);
      }
    }
  }

  sections.push("");
  sections.push(`---`);
  sections.push(`\nGenerate the risk assessment for ${risk.id} based on the data above.`);

  return sections.join("\n");
}
