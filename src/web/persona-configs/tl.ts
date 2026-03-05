import { registerPersonaView, registerPersonaPage } from "../persona-views.js";
import { tlDashboardPage } from "../templates/pages/tl/dashboard.js";
import { tlBacklogPage } from "../templates/pages/tl/backlog.js";
import { tlSprintPage } from "../templates/pages/tl/sprint.js";
import { tlDecisionsPage } from "../templates/pages/tl/decisions.js";

registerPersonaView({
  shortName: "tl",
  displayName: "Technical Lead",
  description: "Technical backlog, architecture decisions, and sprint work",
  color: "#fbbf24",
  navItems: [
    { path: "/tl/dashboard", label: "Dashboard" },
    { path: "/tl/backlog", label: "Technical Backlog" },
    { path: "/tl/sprint", label: "Sprint Work" },
    { path: "/tl/decisions", label: "Architecture Decisions" },
  ],
});

registerPersonaPage("tl", "dashboard", tlDashboardPage);
registerPersonaPage("tl", "backlog", tlBacklogPage);
registerPersonaPage("tl", "sprint", tlSprintPage);
registerPersonaPage("tl", "decisions", tlDecisionsPage);
