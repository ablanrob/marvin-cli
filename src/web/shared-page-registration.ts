import { registerPersonaPage } from "./persona-views.js";
import {
  sharedTimelinePage,
  sharedBoardPage,
  sharedUpcomingPage,
  sharedGarPage,
  sharedHealthPage,
  sharedSprintSummaryPage,
  sharedSprintBlockersPage,
  sharedSprintRisksPage,
} from "./templates/pages/shared-wrappers.js";

const SHARED_PAGES = [
  { pageId: "timeline", renderer: sharedTimelinePage },
  { pageId: "board", renderer: sharedBoardPage },
  { pageId: "upcoming", renderer: sharedUpcomingPage },
  { pageId: "gar", renderer: sharedGarPage },
  { pageId: "health", renderer: sharedHealthPage },
  { pageId: "sprint-summary", renderer: sharedSprintSummaryPage },
  { pageId: "sprint-blockers", renderer: sharedSprintBlockersPage },
  { pageId: "sprint-risks", renderer: sharedSprintRisksPage },
] as const;

for (const persona of ["po", "dm", "tl"] as const) {
  for (const { pageId, renderer } of SHARED_PAGES) {
    registerPersonaPage(persona, pageId, renderer);
  }
}
