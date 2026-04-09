import type { Document } from "../storage/types.js";
import { daysBetween } from "../reports/health/collector.js";

export interface TrendingSignal {
  factor: string;
  points: number;
}

export interface TrendingItem {
  id: string;
  title: string;
  type: string;
  status: string;
  score: number;
  signals: TrendingSignal[];
}

export interface TrendingInput {
  openItems: Document[];
  recentMeetings: Document[];
  crossRefCounts: Map<string, number>;
  activeSprintIds: Set<string>;
  activeEpicIds: Set<string>;
  today: string;
}

/**
 * Score open items by trending relevance using a 6-factor algorithm:
 * recency (20pt), sprint proximity (25pt), meeting mentions (15pt),
 * priority (15pt), aging (10pt), cross-references (15pt).
 * Returns up to 15 items with score > 0, sorted by score descending.
 */
export function computeTrending(input: TrendingInput): TrendingItem[] {
  const { openItems, recentMeetings, crossRefCounts, activeSprintIds, activeEpicIds, today } =
    input;

  return openItems
    .map((doc) => {
      const signals: TrendingSignal[] = [];
      let score = 0;

      // Recency: max 20 pts, decay over 30 days
      const updated = doc.frontmatter.updated ?? doc.frontmatter.created;
      const ageDays = daysBetween(updated, today);
      const safeAge = Math.max(0, ageDays);
      const recencyPts = Math.min(20, Math.max(0, Math.round(20 * (1 - safeAge / 30))));
      if (recencyPts > 0) {
        signals.push({ factor: "recency", points: recencyPts });
        score += recencyPts;
      }

      // Sprint proximity: max 25 pts
      const tags = (doc.frontmatter.tags as string[]) ?? [];
      const linkedToActiveSprint = tags.some(
        (t) => t.startsWith("sprint:") && activeSprintIds.has(t.slice(7)),
      );
      const linkedToActiveEpic = tags.some(
        (t) => t.startsWith("epic:") && activeEpicIds.has(t.slice(5)),
      );
      if (linkedToActiveSprint) {
        signals.push({ factor: "sprint proximity", points: 25 });
        score += 25;
      } else if (linkedToActiveEpic) {
        signals.push({ factor: "sprint proximity", points: 15 });
        score += 15;
      }

      // Meeting mentions: max 15 pts
      const mentionCount = recentMeetings.filter((m) =>
        (m.content ?? "").includes(doc.frontmatter.id),
      ).length;
      if (mentionCount > 0) {
        const meetingPts = Math.min(15, mentionCount * 5);
        signals.push({ factor: "meeting mentions", points: meetingPts });
        score += meetingPts;
      }

      // Priority: max 15 pts
      const priority = (doc.frontmatter.priority as string)?.toLowerCase();
      const priorityPts =
        priority === "critical" ? 15 : priority === "high" ? 10 : priority === "medium" ? 3 : 0;
      if (priorityPts > 0) {
        signals.push({ factor: "priority", points: priorityPts });
        score += priorityPts;
      }

      // Aging: max 10 pts for open questions/actions older than 14 days
      if (["action", "question"].includes(doc.frontmatter.type)) {
        const createdDays = daysBetween(doc.frontmatter.created, today);
        if (createdDays >= 14) {
          const agingPts = Math.min(10, Math.floor((createdDays - 14) / 7) * 3 + 5);
          signals.push({ factor: "aging", points: agingPts });
          score += agingPts;
        }
      }

      // Cross-references: max 15 pts
      const refs = crossRefCounts.get(doc.frontmatter.id) ?? 0;
      if (refs > 0) {
        const crossRefPts = Math.min(15, refs * 5);
        signals.push({ factor: "cross-references", points: crossRefPts });
        score += crossRefPts;
      }

      return {
        id: doc.frontmatter.id,
        title: doc.frontmatter.title,
        type: doc.frontmatter.type,
        status: doc.frontmatter.status,
        score,
        signals,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}
