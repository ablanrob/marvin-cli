import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../storage/store.js";
import type { MarvinProjectConfig } from "../core/config.js";
import type { SourceManifestManager } from "../sources/manifest.js";
import { runStep, type BootstrapStep, type BootstrapSection } from "./bootstrap.js";

export interface BootstrapToolOptions {
  config?: MarvinProjectConfig;
  manifest?: SourceManifestManager;
}

export function createBootstrapTools(
  store: DocumentStore,
  options?: BootstrapToolOptions,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "bootstrap_sprint_zero",
      "Guided multi-step workflow that produces a draft Sprint 0 with linked bootstrapping actions. Call with no arguments to start at survey step. Each step returns next_step to chain calls. Only the commit step writes to disk; all other steps are read-only.",
      {
        step: z
          .enum(["survey", "draft", "populate", "review", "commit"])
          .optional()
          .describe("Workflow step. Omit on first call to start at survey."),
        section: z
          .enum([
            "infrastructure-provisioning",
            "backlog-refinement",
            "ceremony-scheduling",
            "integration-setup",
            "aem-addendum",
          ])
          .optional()
          .describe("Restrict populate step to one section."),
        includeAemAddendum: z
          .boolean()
          .optional()
          .describe(
            "Override AEM addendum inclusion. Default: auto-detect from methodology config.",
          ),
      },
      async (args) => {
        if (!options?.config) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Bootstrap unavailable: project config not initialized.",
              },
            ],
            isError: true,
          };
        }

        const ctx = {
          store,
          config: options.config,
          manifest: options.manifest,
        };

        try {
          const result = runStep(
            ctx,
            args.step as BootstrapStep | undefined,
            args.section as BootstrapSection | undefined,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Bootstrap error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
    ),
  ];
}
