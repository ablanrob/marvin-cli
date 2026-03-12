import type { IncomingMessage, ServerResponse } from "node:http";
import type { DocumentStore } from "../storage/store.js";
import {
  getDocumentListData,
  getDocumentDetail,
  getSprintSummaryData,
} from "./data.js";
import { layout, escapeHtml, typeLabel, type NavGroup } from "./templates/layout.js";
import { renderStyles } from "./templates/styles.js";
import { documentsPage } from "./templates/pages/documents.js";
import { documentDetailPage } from "./templates/pages/document-detail.js";
import { sprintSummaryPage } from "./templates/pages/sprint-summary.js";
import { personaPickerPage } from "./templates/pages/persona-picker.js";
import { generateSprintSummary } from "../reports/sprint-summary/generator.js";
import { generateRiskAssessment } from "../reports/sprint-summary/risk-assessment.js";
import { getPersona } from "../personas/registry.js";
import { renderMarkdown } from "./templates/layout.js";
import {
  parsePersonaFromPath,
  resolvePersona,
  getPersonaView,
  getPersonaPageRenderer,
  SHARED_NAV_ITEMS,
  type DashboardPersona,
} from "./persona-views.js";
import { renderPersonaSwitcher } from "./templates/persona-switcher.js";

// Import persona configs to trigger registration
import "./persona-configs/po.js";
import "./persona-configs/dm.js";
import "./persona-configs/tl.js";

// Import shared page registrations
import "./shared-page-registration.js";

/** Layout overrides per shared pageId */
const PAGE_LAYOUT_OVERRIDES: Record<string, { mainClass?: string }> = {
  timeline: { mainClass: "expanded" },
};

function buildPersonaLayoutOpts(
  persona: DashboardPersona,
  activePath: string,
  navGroups: NavGroup[],
): { personaSwitcherHtml: string; personaNavHtml?: string; personaAccentColor?: string } {
  const switcherHtml = renderPersonaSwitcher(persona, activePath);
  const view = persona ? getPersonaView(persona) : undefined;

  if (!view) {
    return { personaSwitcherHtml: switcherHtml };
  }

  const isActive = (href: string) =>
    activePath === href || (href !== "/" && activePath.startsWith(href))
      ? " active"
      : "";

  // Primary: persona's own nav items
  const personaLinks = view.navItems
    .map(
      (item) =>
        `<a href="${item.path}" class="${isActive(item.path)}">${escapeHtml(item.label)}</a>`,
    )
    .join("\n        ");

  // Chevron SVG for collapsible groups
  const chevronSvg = `<svg class="nav-group-chevron" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M4.94 5.72a.75.75 0 0 1 1.06-.02L8 7.56l1.97-1.84a.75.75 0 1 1 1.02 1.1l-2.5 2.34a.75.75 0 0 1-1.02 0l-2.5-2.34a.75.75 0 0 1-.03-1.06z"/></svg>`;

  // Project group: shared pages
  const sharedLinks = SHARED_NAV_ITEMS
    .map((item) => {
      const href = `/${persona}/${item.pageId}`;
      return `<a href="${href}" class="${isActive(href)}">${escapeHtml(item.label)}</a>`;
    })
    .join("\n            ");

  const projectGroupActive = SHARED_NAV_ITEMS.some(
    (item) => isActive(`/${persona}/${item.pageId}`) !== "",
  );

  // Artifact groups from navGroups
  const artifactGroupsHtml = navGroups
    .map((group) => {
      const links = group.types
        .map((type) => {
          const href = `/docs/${type}?persona=${persona}`;
          return `<a href="${href}" class="${isActive(`/docs/${type}`)}">${typeLabel(type)}s</a>`;
        })
        .join("\n            ");
      const groupActive = group.types.some(
        (type) => isActive(`/docs/${type}`) !== "",
      );
      const collapsed = groupActive ? "" : " nav-collapsed";
      const groupKey = `art-${group.label.toLowerCase().replace(/\s+/g, "-")}`;
      return `
        <div class="nav-group nav-group-secondary nav-group-collapsible${collapsed}" data-nav-group="${escapeHtml(groupKey)}">
          <div class="nav-group-label" onclick="toggleNavGroup(this)">${chevronSvg} <span>${escapeHtml(group.label)}</span></div>
          <div class="nav-group-links">
            ${links}
          </div>
        </div>`;
    })
    .join("\n");

  const projectCollapsed = projectGroupActive ? "" : " nav-collapsed";
  const navHtml = `
        ${personaLinks}
        <div class="nav-group nav-group-secondary nav-group-collapsible${projectCollapsed}" data-nav-group="project">
          <div class="nav-group-label" onclick="toggleNavGroup(this)">${chevronSvg} <span>Project</span></div>
          <div class="nav-group-links">
            ${sharedLinks}
          </div>
        </div>
        ${artifactGroupsHtml}`;

  return {
    personaSwitcherHtml: switcherHtml,
    personaNavHtml: navHtml,
    personaAccentColor: view.color,
  };
}

interface CachedSummary {
  html: string;
  generatedAt: string;
}

const sprintSummaryCache = new Map<string, CachedSummary>();

/** Old root routes that should redirect to persona-scoped versions */
const OLD_ROOT_PAGES = new Set(["timeline", "gar", "health", "upcoming", "sprint-summary"]);

export function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: DocumentStore,
  projectName: string,
  navGroups: NavGroup[],
): void {
  const parsed = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = parsed.pathname;
  const navTypes = store.registeredTypes;

  try {
    // GET /styles.css
    if (pathname === "/styles.css") {
      res.writeHead(200, {
        "Content-Type": "text/css",
        "Cache-Control": "public, max-age=300",
      });
      res.end(renderStyles());
      return;
    }

    // --- Redirects for old root routes ---

    // /timeline, /gar, /health, /upcoming, /sprint-summary → /:persona/:page
    const oldRootMatch = pathname.match(/^\/([a-z-]+)$/);
    if (oldRootMatch && OLD_ROOT_PAGES.has(oldRootMatch[1])) {
      const pageId = oldRootMatch[1];
      const persona = resolvePersona(pathname, parsed.searchParams) ?? "po";
      const qs = parsed.searchParams.toString();
      const target = `/${persona}/${pageId}${qs ? `?${qs}` : ""}`;
      res.writeHead(302, { Location: target });
      res.end();
      return;
    }

    // /board or /board/:type → /:persona/board[/:type]
    const oldBoardMatch = pathname.match(/^\/board(?:\/([^/]+))?$/);
    if (oldBoardMatch) {
      const persona = resolvePersona(pathname, parsed.searchParams) ?? "po";
      const typeSuffix = oldBoardMatch[1] ? `/${oldBoardMatch[1]}` : "";
      res.writeHead(302, { Location: `/${persona}/board${typeSuffix}` });
      res.end();
      return;
    }

    // --- Root: persona picker ---

    if (pathname === "/") {
      const body = personaPickerPage();
      respond(res, layout({
        title: "Choose View",
        activePath: "/",
        projectName,
        navGroups,
      }, body));
      return;
    }

    // Persona root redirects: /po → /po/dashboard
    const personaRootMatch = pathname.match(/^\/(po|dm|tl)$/);
    if (personaRootMatch) {
      res.writeHead(302, { Location: `/${personaRootMatch[1]}/dashboard` });
      res.end();
      return;
    }

    // --- Persona page routes: /:persona/:pageId[/:subPath] ---

    const personaPageMatch = pathname.match(/^\/(po|dm|tl)\/([a-z-]+)(?:\/([a-z0-9-]+))?$/);
    if (personaPageMatch) {
      const [, personaKey, pageId, subPath] = personaPageMatch;
      const pPersona = personaKey as DashboardPersona;
      const renderer = getPersonaPageRenderer(personaKey, pageId);
      const view = getPersonaView(pPersona);

      const pOpts = buildPersonaLayoutOpts(pPersona, pathname, navGroups);
      const layoutOverrides = PAGE_LAYOUT_OVERRIDES[pageId] ?? {};

      if (renderer) {
        // Handle board sub-path type validation
        if (pageId === "board" && subPath && !navTypes.includes(subPath)) {
          notFound(res, projectName, navGroups, pathname, pPersona, pOpts);
          return;
        }

        const body = renderer({
          store,
          projectName,
          searchParams: parsed.searchParams,
          subPath,
          persona: personaKey,
        });
        respond(
          res,
          layout(
            {
              title: `${view?.displayName ?? personaKey.toUpperCase()} — ${pageId}`,
              activePath: pathname,
              projectName,
              navGroups,
              persona: pPersona,
              ...pOpts,
              ...layoutOverrides,
            },
            body,
          ),
        );
      } else {
        const body = `
          <div class="persona-placeholder">
            <h3>Coming Soon</h3>
            <p>The <strong>${pageId}</strong> page for ${view?.displayName ?? personaKey.toUpperCase()} is under construction.</p>
            <p><a href="/${personaKey}/dashboard">Back to dashboard</a></p>
          </div>`;
        respond(
          res,
          layout(
            {
              title: `${view?.displayName ?? personaKey.toUpperCase()} — ${pageId}`,
              activePath: pathname,
              projectName,
              navGroups,
              persona: pPersona,
              ...pOpts,
            },
            body,
          ),
        );
      }
      return;
    }

    // POST /api/sprint-summary
    if (pathname === "/api/sprint-summary" && req.method === "POST") {
      let bodyStr = "";
      req.on("data", (chunk) => { bodyStr += chunk; });
      req.on("end", async () => {
        try {
          const { sprintId, persona: personaKey } = JSON.parse(bodyStr || "{}");
          const data = getSprintSummaryData(store, sprintId);
          if (!data) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Sprint not found" }));
            return;
          }
          const personaDef = personaKey ? getPersona(personaKey) : undefined;
          const summary = await generateSprintSummary(data, personaDef?.systemPrompt);
          const html = renderMarkdown(summary);
          const generatedAt = new Date().toISOString();
          sprintSummaryCache.set(data.sprint.id, { html, generatedAt });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ summary, html, generatedAt }));
        } catch (err) {
          console.error("[marvin web] Sprint summary generation error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to generate summary" }));
        }
      });
      return;
    }

    // POST /api/risk-assessment
    if (pathname === "/api/risk-assessment" && req.method === "POST") {
      let bodyStr = "";
      req.on("data", (chunk) => { bodyStr += chunk; });
      req.on("end", async () => {
        try {
          const { sprintId, riskId } = JSON.parse(bodyStr || "{}");
          if (!riskId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "riskId is required" }));
            return;
          }
          const data = getSprintSummaryData(store, sprintId);
          if (!data) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Sprint not found" }));
            return;
          }
          const markdown = await generateRiskAssessment(data, riskId, store);
          const html = renderMarkdown(markdown);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ riskId, html }));
        } catch (err) {
          console.error("[marvin web] Risk assessment generation error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to generate risk assessment" }));
        }
      });
      return;
    }

    // GET /docs/:type/:id
    const detailMatch = pathname.match(/^\/docs\/([^/]+)\/([^/]+)$/);
    if (detailMatch) {
      const [, type, id] = detailMatch;
      const persona = resolvePersona(pathname, parsed.searchParams);
      const pOpts = buildPersonaLayoutOpts(persona, pathname, navGroups);

      const doc = getDocumentDetail(store, type, id);
      if (!doc) {
        notFound(res, projectName, navGroups, pathname, persona, pOpts);
        return;
      }
      const body = documentDetailPage(doc);
      respond(res, layout({ title: `${id} — ${doc.frontmatter.title}`, activePath: `/docs/${type}`, projectName, navGroups, persona, ...pOpts }, body));
      return;
    }

    // GET /docs/:type
    const listMatch = pathname.match(/^\/docs\/([^/]+)$/);
    if (listMatch) {
      const type = listMatch[1];
      const persona = resolvePersona(pathname, parsed.searchParams);
      const pOpts = buildPersonaLayoutOpts(persona, pathname, navGroups);

      const filterStatus = parsed.searchParams.get("status") ?? undefined;
      const filterOwner = parsed.searchParams.get("owner") ?? undefined;
      const data = getDocumentListData(store, type, filterStatus, filterOwner);
      if (!data) {
        notFound(res, projectName, navGroups, pathname, persona, pOpts);
        return;
      }
      const body = documentsPage(data);
      respond(res, layout({ title: `${type}`, activePath: `/docs/${type}`, projectName, navGroups, persona, ...pOpts }, body));
      return;
    }

    notFound(res, projectName, navGroups, pathname, null);
  } catch (err) {
    console.error("[marvin web] Error handling request:", err);
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end("<h1>500 — Internal Server Error</h1>");
  }
}

function respond(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function notFound(
  res: ServerResponse,
  projectName: string,
  navGroups: NavGroup[],
  activePath: string,
  persona?: DashboardPersona,
  pOpts?: { personaSwitcherHtml?: string; personaNavHtml?: string; personaAccentColor?: string },
): void {
  const homeLink = persona ? `/${persona}/dashboard` : "/";
  const body = `<div class="empty"><h2>404</h2><p>Page not found.</p><p><a href="${homeLink}">Go to dashboard</a></p></div>`;
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Not Found", activePath, projectName, navGroups, persona, ...pOpts }, body));
}
