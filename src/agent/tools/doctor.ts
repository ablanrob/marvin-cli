import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../storage/store.js";
import type { SourceManifestManager } from "../../sources/manifest.js";
import type { MarvinProjectConfig } from "../../core/config.js";
import { loadUserConfig } from "../../core/config.js";
import { runDoctorScan, runDoctorFix } from "../../doctor/engine.js";
import { runHealthCheck } from "../../doctor/health/engine.js";
import { buildOnboardingGuide } from "../../doctor/health/onboarding.js";
import { resolveJiraStatus } from "../../skills/builtin/jira/client.js";

export interface DoctorToolOptions {
  config?: MarvinProjectConfig;
  manifest?: SourceManifestManager;
  marvinDir?: string;
}

export function createDoctorTools(
  store: DocumentStore,
  options?: DoctorToolOptions,
): SdkMcpToolDefinition<any>[] {
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

    tool(
      "check_project_health",
      "Run governance health checks on the project. Returns soft recommendations about missing setup (sprints, Jira, source processing) and phase readiness — not document-level issues (use run_doctor for those).",
      {},
      async () => {
        if (!options?.config || !options?.marvinDir) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Health check unavailable: project config or marvinDir not initialized.",
              },
            ],
            isError: true,
          };
        }

        const { config, marvinDir, manifest } = options;

        try {
          const report = runHealthCheck({ store, config, manifest, marvinDir });

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
                text: `Health check error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "get_started",
      "Get a tailored onboarding guide for the project. Inspects current state (artifacts, sources, config) and returns an ordered checklist of recommended setup steps with completion status. Methodology-aware (SAP AEM vs generic agile).",
      {},
      async () => {
        if (!options?.config || !options?.marvinDir) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Onboarding unavailable: project config or marvinDir not initialized.",
              },
            ],
            isError: true,
          };
        }

        const { config, marvinDir, manifest } = options;

        // Scan manifest before building guide
        if (manifest) {
          try {
            manifest.scan();
          } catch {
            // Non-fatal
          }
        }

        try {
          const guide = buildOnboardingGuide({ store, config, manifest, marvinDir });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(guide, null, 2),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Onboarding error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "check_integrations",
      "Check which integrations (Jira, Confluence) are configured and their credential status. Returns presence/source info without exposing secrets. Use this instead of reading config files directly.",
      {},
      async () => {
        const jiraSources = {
          project: options?.config?.jira
            ? { host: options.config.jira.host, email: options.config.jira.email }
            : undefined,
          user: loadUserConfig().jira,
        };

        const jira = resolveJiraStatus(jiraSources);

        const result = {
          jira: {
            configured: jira.host.configured && jira.email.configured && jira.apiToken.configured,
            host: jira.host.value ?? null,
            hostSource: jira.host.source ?? null,
            emailConfigured: jira.email.configured,
            emailSource: jira.email.source ?? null,
            apiTokenConfigured: jira.apiToken.configured,
            apiTokenSource: jira.apiToken.source ?? null,
            projectKey: options?.config?.jira?.projectKey?.trim() || null,
          },
          confluence: {
            configured: jira.host.configured && jira.email.configured && jira.apiToken.configured,
            note: "Confluence uses the same Jira/Atlassian credentials.",
          },
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnlyHint: true } },
    ),
  ];
}
