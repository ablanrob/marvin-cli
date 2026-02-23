import type { DocumentStore } from "../../storage/store.js";
import type { GarItemRef, GarMetrics } from "./types.js";

export function collectGarMetrics(store: DocumentStore): GarMetrics {
  const allActions = store.list({ type: "action" });
  const openActions = allActions.filter((d) => d.frontmatter.status === "open");
  const doneActions = allActions.filter((d) => d.frontmatter.status === "done");

  const allDocs = store.list();
  const blockedItems = allDocs.filter((d) =>
    d.frontmatter.tags?.includes("blocked"),
  );
  const overdueItems = allDocs.filter((d) =>
    d.frontmatter.tags?.includes("overdue"),
  );
  const openQuestions = store.list({ type: "question", status: "open" });
  const riskItems = allDocs.filter((d) =>
    d.frontmatter.tags?.includes("risk"),
  );
  const unownedActions = openActions.filter((d) => !d.frontmatter.owner);

  const total = allActions.length;
  const done = doneActions.length;
  const completionPct = total > 0 ? Math.round((done / total) * 100) : 100;

  const scheduleItems: GarItemRef[] = [
    ...blockedItems,
    ...overdueItems,
  ]
    .filter(
      (d, i, arr) => arr.findIndex((x) => x.frontmatter.id === d.frontmatter.id) === i,
    )
    .map((d) => ({ id: d.frontmatter.id, title: d.frontmatter.title }));

  const qualityItems: GarItemRef[] = [
    ...riskItems,
    ...openQuestions,
  ]
    .filter(
      (d, i, arr) => arr.findIndex((x) => x.frontmatter.id === d.frontmatter.id) === i,
    )
    .map((d) => ({ id: d.frontmatter.id, title: d.frontmatter.title }));

  const resourceItems: GarItemRef[] = unownedActions.map((d) => ({
    id: d.frontmatter.id,
    title: d.frontmatter.title,
  }));

  return {
    scope: {
      total,
      open: openActions.length,
      done,
      completionPct,
    },
    schedule: {
      blocked: blockedItems.length,
      overdue: overdueItems.length,
      items: scheduleItems,
    },
    quality: {
      risks: riskItems.length,
      openQuestions: openQuestions.length,
      items: qualityItems,
    },
    resources: {
      unowned: unownedActions.length,
      items: resourceItems,
    },
  };
}
