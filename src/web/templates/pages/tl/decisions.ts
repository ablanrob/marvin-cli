import type { PersonaPageContext } from "../../../persona-views.js";
import { collapsibleSection, escapeHtml, formatDate, statusBadge } from "../../layout.js";

/** Decision statuses that indicate the decision has been resolved */
const RESOLVED_STATUSES = new Set(["decided", "superseded", "dismissed"]);

export function tlDecisionsPage(ctx: PersonaPageContext): string {
  const decisions = ctx.store.list({ type: "decision" });
  const questions = ctx.store.list({ type: "question" });

  // Technical decisions: filter by tags or show all if no technical tags exist
  const technicalDecisions = decisions.filter((d) => {
    const tags = (d.frontmatter.tags as string[]) ?? [];
    return tags.some((t) => {
      const lower = t.toLowerCase();
      return (
        lower.includes("technical") || lower.includes("architecture") || lower.includes("design")
      );
    });
  });

  // If no tagged technical decisions, show all decisions
  const displayDecisions = technicalDecisions.length > 0 ? technicalDecisions : decisions;
  const isFiltered = technicalDecisions.length > 0;

  const openDecisions = displayDecisions.filter(
    (d) => !RESOLVED_STATUSES.has(d.frontmatter.status),
  );
  const resolvedDecisions = displayDecisions.filter((d) =>
    RESOLVED_STATUSES.has(d.frontmatter.status),
  );

  // Technical questions
  const technicalQuestions = questions.filter((d) => {
    const tags = (d.frontmatter.tags as string[]) ?? [];
    return tags.some((t) => {
      const lower = t.toLowerCase();
      return (
        lower.includes("technical") || lower.includes("architecture") || lower.includes("design")
      );
    });
  });
  const displayQuestions = technicalQuestions.length > 0 ? technicalQuestions : questions;
  const openQuestions = displayQuestions.filter((d) => d.frontmatter.status === "open");

  const statsCards = `
    <div class="cards">
      <div class="card">
        <div class="card-label">Open Decisions</div>
        <div class="card-value${openDecisions.length > 0 ? " priority-medium" : ""}">${openDecisions.length}</div>
        <div class="card-sub">${isFiltered ? "technical" : "all"} decisions</div>
      </div>
      <div class="card">
        <div class="card-label">Resolved</div>
        <div class="card-value">${resolvedDecisions.length}</div>
        <div class="card-sub">decisions made</div>
      </div>
      <div class="card">
        <div class="card-label">Open Questions</div>
        <div class="card-value${openQuestions.length > 0 ? " priority-medium" : ""}">${openQuestions.length}</div>
        <div class="card-sub">${technicalQuestions.length > 0 ? "technical" : "all"} questions</div>
      </div>
    </div>`;

  function decisionTable(docs: typeof decisions): string {
    if (docs.length === 0) return '<div class="empty"><p>None found.</p></div>';
    return `<div class="table-wrap">
      <table>
        <thead>
          <tr><th>ID</th><th>Title</th><th>Status</th><th>Owner</th><th>Tags</th><th>Created</th></tr>
        </thead>
        <tbody>
          ${docs
            .map((d) => {
              const tags = (d.frontmatter.tags as string[]) ?? [];
              return `
          <tr>
            <td><a href="/docs/decision/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
            <td>${escapeHtml(d.frontmatter.title)}</td>
            <td>${statusBadge(d.frontmatter.status)}</td>
            <td>${d.frontmatter.owner ? escapeHtml(d.frontmatter.owner) : '<span class="text-dim">—</span>'}</td>
            <td>${tags.length > 0 ? tags.map((t) => `<span class="signal-tag">${escapeHtml(t)}</span>`).join(" ") : '<span class="text-dim">—</span>'}</td>
            <td>${formatDate(d.frontmatter.created)}</td>
          </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  const openSection = collapsibleSection(
    "tl-decisions-open",
    `Open Decisions (${openDecisions.length})`,
    decisionTable(openDecisions),
    { titleTag: "h3" },
  );

  const resolvedSection = collapsibleSection(
    "tl-decisions-resolved",
    `Resolved Decisions (${resolvedDecisions.length})`,
    decisionTable(resolvedDecisions),
    { titleTag: "h3", defaultCollapsed: true },
  );

  const questionsSection =
    openQuestions.length > 0
      ? collapsibleSection(
          "tl-decisions-questions",
          `Open Questions (${openQuestions.length})`,
          `<div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Owner</th><th>Created</th></tr>
            </thead>
            <tbody>
              ${openQuestions
                .map(
                  (d) => `
              <tr>
                <td><a href="/docs/question/${escapeHtml(d.frontmatter.id)}">${escapeHtml(d.frontmatter.id)}</a></td>
                <td>${escapeHtml(d.frontmatter.title)}</td>
                <td>${d.frontmatter.owner ? escapeHtml(d.frontmatter.owner) : '<span class="text-dim">—</span>'}</td>
                <td>${formatDate(d.frontmatter.created)}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`,
          { titleTag: "h3" },
        )
      : "";

  return `
    <div class="page-header">
      <h2>Architecture Decisions</h2>
      <div class="subtitle">${isFiltered ? "Technical" : "All"} decisions and open questions</div>
    </div>
    ${statsCards}
    ${openSection}
    ${questionsSection}
    ${resolvedSection}
  `;
}
