import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { SourceManifestManager } from "../../sources/manifest.js";

export function createSourceTools(
  manifest: SourceManifestManager,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "list_sources",
      "List all source documents and their processing status",
      {
        status: z
          .string()
          .optional()
          .describe(
            "Filter by status (pending, processing, completed, error)",
          ),
      },
      async (args) => {
        const statusFilter = args.status as
          | "pending"
          | "processing"
          | "completed"
          | "error"
          | undefined;
        const files = manifest.list(statusFilter);
        const summary = files.map(({ name, entry }) => ({
          name,
          status: entry.status,
          artifacts: entry.artifacts,
          addedAt: entry.addedAt,
          processedAt: entry.processedAt,
          error: entry.error,
        }));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "get_source_info",
      "Get detailed information about a specific source document",
      {
        fileName: z
          .string()
          .describe("Name of the source file (e.g. 'Requirements.pdf')"),
      },
      async (args) => {
        const entry = manifest.get(args.fileName);
        if (!entry) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Source file "${args.fileName}" not found`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { name: args.fileName, ...entry },
                null,
                2,
              ),
            },
          ],
        };
      },
      { annotations: { readOnly: true } },
    ),
  ];
}
