import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../storage/store.js";
import { runDoctorScan, runDoctorFix } from "../../doctor/engine.js";

export function createDoctorTools(store: DocumentStore): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "run_doctor",
      "Scan project documents for structural issues and optionally auto-repair them. Returns a JSON report with all issues found and fixes applied.",
      {
        fix: z
          .boolean()
          .optional()
          .default(false)
          .describe("When true, auto-repair fixable issues"),
        rule: z
          .string()
          .optional()
          .describe(
            "Run only a specific rule (e.g. tag-migration, array-normalization, missing-auto-tags, progress-consistency, orphaned-references)",
          ),
      },
      async (args) => {
        try {
          const report = args.fix
            ? runDoctorFix(store, args.rule)
            : runDoctorScan(store, args.rule);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(report, null, 2),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Doctor error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
    ),
  ];
}
