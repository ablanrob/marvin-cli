import type { IncomingMessage, ServerResponse } from "node:http";
import type { DocumentStore } from "../storage/store.js";
import {
  getOverviewData,
  getDocumentListData,
  getDocumentDetail,
  getGarData,
  getBoardData,
  getDiagramData,
} from "./data.js";
import { layout, type NavGroup } from "./templates/layout.js";
import { renderStyles } from "./templates/styles.js";
import { overviewPage } from "./templates/pages/overview.js";
import { documentsPage } from "./templates/pages/documents.js";
import { documentDetailPage } from "./templates/pages/document-detail.js";
import { garPage } from "./templates/pages/gar.js";
import { healthPage } from "./templates/pages/health.js";
import { boardPage } from "./templates/pages/board.js";
import { timelinePage } from "./templates/pages/timeline.js";
import { collectHealthMetrics } from "../reports/health/collector.js";
import { evaluateHealth } from "../reports/health/evaluator.js";

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

    // GET /
    if (pathname === "/") {
      const data = getOverviewData(store);
      const diagrams = getDiagramData(store);
      const body = overviewPage(data, diagrams, navGroups);
      respond(res, layout({ title: "Overview", activePath: "/", projectName, navGroups }, body));
      return;
    }

    // GET /timeline
    if (pathname === "/timeline") {
      const diagrams = getDiagramData(store);
      const body = timelinePage(diagrams);
      respond(res, layout({ title: "Timeline", activePath: "/timeline", projectName, navGroups, mainClass: "expanded" }, body));
      return;
    }

    // GET /gar
    if (pathname === "/gar") {
      const report = getGarData(store, projectName);
      const body = garPage(report);
      respond(res, layout({ title: "GAR Report", activePath: "/gar", projectName, navGroups }, body));
      return;
    }

    // GET /health
    if (pathname === "/health") {
      const healthMetrics = collectHealthMetrics(store);
      const report = evaluateHealth(projectName, healthMetrics);
      const body = healthPage(report, healthMetrics);
      respond(res, layout({ title: "Health Check", activePath: "/health", projectName, navGroups }, body));
      return;
    }

    // GET /board or /board/:type
    const boardMatch = pathname.match(/^\/board(?:\/([^/]+))?$/);
    if (boardMatch) {
      const type = boardMatch[1];
      if (type && !navTypes.includes(type)) {
        notFound(res, projectName, navGroups, pathname);
        return;
      }
      const data = getBoardData(store, type);
      const body = boardPage(data);
      respond(res, layout({ title: "Board", activePath: "/board", projectName, navGroups }, body));
      return;
    }

    // GET /docs/:type/:id
    const detailMatch = pathname.match(/^\/docs\/([^/]+)\/([^/]+)$/);
    if (detailMatch) {
      const [, type, id] = detailMatch;
      const doc = getDocumentDetail(store, type, id);
      if (!doc) {
        notFound(res, projectName, navGroups, pathname);
        return;
      }
      const body = documentDetailPage(doc);
      respond(res, layout({ title: `${id} — ${doc.frontmatter.title}`, activePath: `/docs/${type}`, projectName, navGroups }, body));
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
        notFound(res, projectName, navGroups, pathname);
        return;
      }
      const body = documentsPage(data);
      respond(res, layout({ title: `${type}`, activePath: `/docs/${type}`, projectName, navGroups }, body));
      return;
    }

    notFound(res, projectName, navGroups, pathname);
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
): void {
  const body = `<div class="empty"><h2>404</h2><p>Page not found.</p><p><a href="/">Go to overview</a></p></div>`;
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Not Found", activePath, projectName, navGroups }, body));
}
