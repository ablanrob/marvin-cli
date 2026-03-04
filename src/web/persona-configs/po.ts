import { registerPersonaView, registerPersonaPage } from "../persona-views.js";
import { poDashboardPage } from "../templates/pages/po/dashboard.js";
import { poBacklogPage } from "../templates/pages/po/backlog.js";
import { poDecisionsPage } from "../templates/pages/po/decisions.js";
import { poDeliveryPage } from "../templates/pages/po/delivery.js";
import { poStakeholdersPage } from "../templates/pages/po/stakeholders.js";

registerPersonaView({
  shortName: "po",
  displayName: "Product Owner",
  description: "Feature delivery, decisions, and stakeholder alignment",
  color: "#6c8cff",
  navItems: [
    { path: "/po/dashboard", label: "Dashboard" },
    { path: "/po/backlog", label: "Product Backlog" },
    { path: "/po/decisions", label: "Decision Log" },
    { path: "/po/delivery", label: "Value Delivery" },
    { path: "/po/stakeholders", label: "Stakeholder View" },
  ],
});

registerPersonaPage("po", "dashboard", poDashboardPage);
registerPersonaPage("po", "backlog", poBacklogPage);
registerPersonaPage("po", "decisions", poDecisionsPage);
registerPersonaPage("po", "delivery", poDeliveryPage);
registerPersonaPage("po", "stakeholders", poStakeholdersPage);
