import type { IncomingMessage, ServerResponse } from "node:http";
import type { DocumentStore } from "../storage/store.js";
import {
  getOverviewData,
  getDocumentListData,
  getDocumentDetail,
  getGarData,
  getBoardData,
  getDiagramData,
  getUpcomingData,
  getSprintSummaryData,
} from "./data.js";
import { layout, escapeHtml, type NavGroup } from "./templates/layout.js";
import { renderStyles } from "./templates/styles.js";
import { overviewPage } from "./templates/pages/overview.js";
import { documentsPage } from "./templates/pages/documents.js";
import { documentDetailPage } from "./templates/pages/document-detail.js";
import { garPage } from "./templates/pages/gar.js";
import { healthPage } from "./templates/pages/health.js";
import { boardPage } from "./templates/pages/board.js";
import { timelinePage } from "./templates/pages/timeline.js";
import { upcomingPage } from "./templates/pages/upcoming.js";
import { sprintSummaryPage } from "./templates/pages/sprint-summary.js";
import { collectHealthMetrics } from "../reports/health/collector.js";
import { evaluateHealth } from "../reports/health/evaluator.js";
import { generateSprintSummary } from "../reports/sprint-summary/generator.js";
import { getPersona } from "../personas/registry.js";
import { renderMarkdown } from "./templates/layout.js";
import {
  parsePersonaFromPath,
  getPersonaView,
  getPersonaPageRenderer,
  type DashboardPersona,
} from "./persona-views.js";
import { renderPersonaBanner, renderPersonaSwitcher } from "./templates/persona-switcher.js";

// Import persona configs to trigger registration
import "./persona-configs/po.js";
import "./persona-configs/dm.js";
import "./persona-configs/tl.js";

function buildPersonaLayoutOpts(
  persona: DashboardPersona,
  activePath: string,
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

  const personaLinks = view.navItems
    .map(
      (item) =>
        `<a href="${item.path}" class="${isActive(item.path)}">${escapeHtml(item.label)}</a>`,
    )
    .join("\n        ");

  const navHtml = `
        ${personaLinks}
        <div class="nav-group">
          <div class="nav-group-label">Admin</div>
          <a href="/">Full Dashboard</a>
        </div>`;

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

  // Parse persona from URL path
  const persona: DashboardPersona = parsePersonaFromPath(pathname);
  const personaOpts = buildPersonaLayoutOpts(persona, pathname);

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

    // Persona root redirects: /po → /po/dashboard, etc.
    const personaRootMatch = pathname.match(/^\/(po|dm|tl)$/);
    if (personaRootMatch) {
      res.writeHead(302, { Location: `/${personaRootMatch[1]}/dashboard` });
      res.end();
      return;
    }

    // Persona page routes: /:persona/:pageId
    const personaPageMatch = pathname.match(/^\/(po|dm|tl)\/([a-z-]+)$/);
    if (personaPageMatch) {
      const [, personaKey, pageId] = personaPageMatch;
      const pPersona = personaKey as DashboardPersona;
      const renderer = getPersonaPageRenderer(personaKey, pageId);
      const view = getPersonaView(pPersona);

      const pOpts = buildPersonaLayoutOpts(pPersona, pathname);
      if (renderer) {
        const body = renderer({ store, projectName });
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
      } else {
        // Placeholder for unregistered persona pages
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

    // GET /
    if (pathname === "/") {
      const data = getOverviewData(store);
      const diagrams = getDiagramData(store);
      const body = overviewPage(data, diagrams, navGroups);
      const banner = renderPersonaBanner();
      respond(res, layout({ title: "Overview", activePath: "/", projectName, navGroups, ...personaOpts, bodyPrefix: banner }, body));
      return;
    }

    // GET /timeline
    if (pathname === "/timeline") {
      const diagrams = getDiagramData(store);
      const body = timelinePage(diagrams);
      respond(res, layout({ title: "Timeline", activePath: "/timeline", projectName, navGroups, ...personaOpts, mainClass: "expanded" }, body));
      return;
    }

    // GET /gar
    if (pathname === "/gar") {
      const report = getGarData(store, projectName);
      const body = garPage(report);
      respond(res, layout({ title: "GAR Report", activePath: "/gar", projectName, navGroups, ...personaOpts }, body));
      return;
    }

    // GET /health
    if (pathname === "/health") {
      const healthMetrics = collectHealthMetrics(store);
      const report = evaluateHealth(projectName, healthMetrics);
      const body = healthPage(report, healthMetrics);
      respond(res, layout({ title: "Health Check", activePath: "/health", projectName, navGroups, ...personaOpts }, body));
      return;
    }

    // GET /upcoming
    if (pathname === "/upcoming") {
      const data = getUpcomingData(store);
      const body = upcomingPage(data);
      respond(res, layout({ title: "Upcoming", activePath: "/upcoming", projectName, navGroups, ...personaOpts }, body));
      return;
    }

    // GET /sprint-summary
    if (pathname === "/sprint-summary" && req.method === "GET") {
      const sprintId = parsed.searchParams.get("sprint") ?? undefined;
      const data = getSprintSummaryData(store, sprintId);
      const cached = data ? sprintSummaryCache.get(data.sprint.id) : undefined;
      const body = sprintSummaryPage(data, cached ? { html: cached.html, generatedAt: cached.generatedAt } : undefined);
      respond(res, layout({ title: "Sprint Summary", activePath: "/sprint-summary", projectName, navGroups, ...personaOpts }, body));
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

    // GET /board or /board/:type
    const boardMatch = pathname.match(/^\/board(?:\/([^/]+))?$/);
    if (boardMatch) {
      const type = boardMatch[1];
      if (type && !navTypes.includes(type)) {
        notFound(res, projectName, navGroups, pathname, personaOpts);
        return;
      }
      const data = getBoardData(store, type);
      const body = boardPage(data);
      respond(res, layout({ title: "Board", activePath: "/board", projectName, navGroups, ...personaOpts }, body));
      return;
    }

    // GET /docs/:type/:id
    const detailMatch = pathname.match(/^\/docs\/([^/]+)\/([^/]+)$/);
    if (detailMatch) {
      const [, type, id] = detailMatch;
      const doc = getDocumentDetail(store, type, id);
      if (!doc) {
        notFound(res, projectName, navGroups, pathname, personaOpts);
        return;
      }
      const body = documentDetailPage(doc);
      respond(res, layout({ title: `${id} — ${doc.frontmatter.title}`, activePath: `/docs/${type}`, projectName, navGroups, ...personaOpts }, body));
      return;
    }

    // GET /docs/:type
    const listMatch = pathname.match(/^\/docs\/([^/]+)$/);
    if (listMatch) {
      const type = listMatch[1];
      const filterStatus = parsed.searchParams.get("status") ?? undefined;
      const filterOwner = parsed.searchParams.get("owner") ?? undefined;
      const data = getDocumentListData(store, type, filterStatus, filterOwner);
      if (!data) {
        notFound(res, projectName, navGroups, pathname, personaOpts);
        return;
      }
      const body = documentsPage(data);
      respond(res, layout({ title: `${type}`, activePath: `/docs/${type}`, projectName, navGroups, ...personaOpts }, body));
      return;
    }

    notFound(res, projectName, navGroups, pathname, personaOpts);
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
  pOpts?: { personaSwitcherHtml?: string; personaNavHtml?: string; personaAccentColor?: string },
): void {
  const body = `<div class="empty"><h2>404</h2><p>Page not found.</p><p><a href="/">Go to overview</a></p></div>`;
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Not Found", activePath, projectName, navGroups, ...pOpts }, body));
}
