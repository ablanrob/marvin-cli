import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";
import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";

const PHASES = ["assess-use-case", "assess-technology", "define-solution"] as const;

export function createAemPhaseTools(
  store: DocumentStore,
  marvinDir?: string,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "get_current_phase",
      "Get the current AEM phase from project configuration",
      {},
      async () => {
        const phase = readPhase(marvinDir);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                currentPhase: phase ?? "unknown",
                phases: PHASES,
                description: getPhaseDescription(phase),
              }, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "advance_phase",
      "Advance to the next AEM phase. Performs soft gate checks and warns if artifacts are incomplete, but does not block.",
      {
        targetPhase: z
          .enum(["assess-use-case", "assess-technology", "define-solution"])
          .optional()
          .describe("Target phase to advance to. If omitted, advances to the next sequential phase."),
      },
      async (args) => {
        const currentPhase = readPhase(marvinDir);
        if (!currentPhase) {
          return {
            content: [{
              type: "text" as const,
              text: "Cannot determine current phase. Ensure config.yaml has aem.currentPhase set.",
            }],
            isError: true,
          };
        }

        const currentIdx = PHASES.indexOf(currentPhase as typeof PHASES[number]);
        const targetPhase = args.targetPhase ?? PHASES[currentIdx + 1];

        if (!targetPhase) {
          return {
            content: [{
              type: "text" as const,
              text: `Already at the final phase: ${currentPhase}. No further phases to advance to.`,
            }],
          };
        }

        const targetIdx = PHASES.indexOf(targetPhase as typeof PHASES[number]);
        if (targetIdx <= currentIdx) {
          return {
            content: [{
              type: "text" as const,
              text: `Cannot move backward from '${currentPhase}' to '${targetPhase}'. Current phase index: ${currentIdx}, target: ${targetIdx}.`,
            }],
            isError: true,
          };
        }

        // Soft gate checks
        const warnings: string[] = [];
        if (currentPhase === "assess-use-case") {
          const useCases = store.list({ type: "use-case" });
          const drafts = useCases.filter((uc) => uc.frontmatter.status === "draft");
          if (useCases.length === 0) {
            warnings.push("No use cases defined yet.");
          } else if (drafts.length > 0) {
            warnings.push(`${drafts.length} use case(s) still in draft status.`);
          }
        }
        if (currentPhase === "assess-technology" || (currentPhase === "assess-use-case" && targetPhase === "define-solution")) {
          const tas = store.list({ type: "tech-assessment" });
          const drafts = tas.filter((ta) => ta.frontmatter.status === "draft");
          if (tas.length === 0) {
            warnings.push("No tech assessments defined yet.");
          } else if (drafts.length > 0) {
            warnings.push(`${drafts.length} tech assessment(s) still in draft status.`);
          }
        }

        // Write new phase
        writePhase(marvinDir, targetPhase);

        const result: Record<string, unknown> = {
          previousPhase: currentPhase,
          currentPhase: targetPhase,
          description: getPhaseDescription(targetPhase),
        };
        if (warnings.length > 0) {
          result.warnings = warnings;
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      },
    ),
  ];
}

function readPhase(marvinDir?: string): string | undefined {
  if (!marvinDir) return undefined;
  try {
    const configPath = path.join(marvinDir, "config.yaml");
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = YAML.parse(raw) as Record<string, unknown>;
    const aem = config.aem as Record<string, unknown> | undefined;
    return aem?.currentPhase as string | undefined;
  } catch {
    return undefined;
  }
}

function writePhase(marvinDir: string | undefined, phase: string): void {
  if (!marvinDir) return;
  const configPath = path.join(marvinDir, "config.yaml");
  const raw = fs.readFileSync(configPath, "utf-8");
  const config = YAML.parse(raw) as Record<string, unknown>;
  if (!config.aem) {
    config.aem = {};
  }
  (config.aem as Record<string, unknown>).currentPhase = phase;
  fs.writeFileSync(configPath, YAML.stringify(config), "utf-8");
}

function getPhaseDescription(phase: string | undefined): string {
  switch (phase) {
    case "assess-use-case":
      return "Phase 1: Assess Extension Use Case — Define and justify business scenarios needing extension.";
    case "assess-technology":
      return "Phase 2: Assess Extension Technology — Evaluate BTP technologies and extension points.";
    case "define-solution":
      return "Phase 3: Define Extension Target Solution — Design the extension architecture.";
    default:
      return "Unknown phase.";
  }
}
