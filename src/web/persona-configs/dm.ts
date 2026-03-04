import { registerPersonaView, registerPersonaPage } from "../persona-views.js";
import { dmDashboardPage } from "../templates/pages/dm/dashboard.js";
import { dmSprintPage } from "../templates/pages/dm/sprint.js";
import { dmActionsPage } from "../templates/pages/dm/actions.js";
import { dmRisksPage } from "../templates/pages/dm/risks.js";
import { dmMeetingsPage } from "../templates/pages/dm/meetings.js";
import { dmGovernancePage } from "../templates/pages/dm/governance.js";

registerPersonaView({
  shortName: "dm",
  displayName: "Delivery Manager",
  description: "Sprint execution, action tracking, and risk management",
  color: "#34d399",
  navItems: [
    { path: "/dm/dashboard", label: "Dashboard" },
    { path: "/dm/sprint", label: "Sprint Execution" },
    { path: "/dm/actions", label: "Action Tracker" },
    { path: "/dm/risks", label: "Risk & Blockers" },
    { path: "/dm/meetings", label: "Meetings" },
    { path: "/dm/governance", label: "Governance" },
  ],
});

registerPersonaPage("dm", "dashboard", dmDashboardPage);
registerPersonaPage("dm", "sprint", dmSprintPage);
registerPersonaPage("dm", "actions", dmActionsPage);
registerPersonaPage("dm", "risks", dmRisksPage);
registerPersonaPage("dm", "meetings", dmMeetingsPage);
registerPersonaPage("dm", "governance", dmGovernancePage);
