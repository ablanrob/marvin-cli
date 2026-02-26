import * as http from "node:http";
import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../storage/store.js";
import { handleRequest } from "../../web/router.js";
import { openBrowser } from "../../web/server.js";
import {
  getOverviewData,
  getGarData,
  getBoardData,
} from "../../web/data.js";
import type { NavGroup } from "../../web/templates/layout.js";

let runningServer: { server: http.Server; port: number } | null = null;

export function createWebTools(
  store: DocumentStore,
  projectName: string,
  navGroups: NavGroup[],
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "start_web_dashboard",
      "Start the Marvin web dashboard on a local port. Returns the base URL. If already running, returns the existing URL.",
      {
        port: z.number().optional().describe("Port to listen on (default: 3000)"),
        open: z.boolean().optional().describe("Open the dashboard in the default browser (default: true)"),
      },
      async (args) => {
        const port = args.port ?? 3000;

        if (runningServer) {
          const url = `http://localhost:${runningServer.port}`;
          return {
            content: [{ type: "text" as const, text: `Dashboard already running at ${url}` }],
          };
        }

        const server = http.createServer((req, res) => {
          handleRequest(req, res, store, projectName, navGroups);
        });

        await new Promise<void>((resolve, reject) => {
          server.on("error", reject);
          server.listen(port, () => resolve());
        });

        runningServer = { server, port };
        const url = `http://localhost:${port}`;

        if (args.open !== false) {
          openBrowser(url);
        }

        return {
          content: [{ type: "text" as const, text: `Dashboard started at ${url}` }],
        };
      },
    ),

    tool(
      "stop_web_dashboard",
      "Stop the running Marvin web dashboard.",
      {},
      async () => {
        if (!runningServer) {
          return {
            content: [{ type: "text" as const, text: "No dashboard is currently running." }],
            isError: true,
          };
        }

        await new Promise<void>((resolve) => {
          runningServer!.server.close(() => resolve());
        });
        runningServer = null;

        return {
          content: [{ type: "text" as const, text: "Dashboard stopped." }],
        };
      },
    ),

    tool(
      "get_web_dashboard_urls",
      "Get all available dashboard page URLs. The dashboard must be running.",
      {},
      async () => {
        if (!runningServer) {
          return {
            content: [{ type: "text" as const, text: "Dashboard is not running. Use start_web_dashboard first." }],
            isError: true,
          };
        }

        const base = `http://localhost:${runningServer.port}`;
        const urls: Record<string, string> = {
          overview: base,
          gar: `${base}/gar`,
          board: `${base}/board`,
        };
        for (const type of store.registeredTypes) {
          urls[type] = `${base}/docs/${type}`;
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(urls, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_dashboard_overview",
      "Get the project overview data: document type counts and recent activity. Works without the web server running.",
      {},
      async () => {
        const data = getOverviewData(store);
        const result = {
          types: data.types,
          recent: data.recent.map((d) => ({
            id: d.frontmatter.id,
            type: d.frontmatter.type,
            title: d.frontmatter.title,
            status: d.frontmatter.status,
            updated: d.frontmatter.updated ?? d.frontmatter.created,
          })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_dashboard_gar",
      "Get the GAR (Governance, Actions, Risks) report as JSON. Works without the web server running.",
      {},
      async () => {
        const report = getGarData(store, projectName);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_dashboard_board",
      "Get board data showing documents grouped by status. Optionally filter by document type. Works without the web server running.",
      {
        type: z.string().optional().describe("Document type to filter by (e.g. 'decision', 'action')"),
      },
      async (args) => {
        const data = getBoardData(store, args.type);
        const result = {
          type: data.type ?? "all",
          types: data.types,
          columns: data.columns.map((col) => ({
            status: col.status,
            count: col.docs.length,
            docs: col.docs.map((d) => ({
              id: d.frontmatter.id,
              type: d.frontmatter.type,
              title: d.frontmatter.title,
              owner: d.frontmatter.owner,
            })),
          })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      },
      { annotations: { readOnly: true } },
    ),
  ];
}
