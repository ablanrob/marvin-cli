import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";
import type { HealthCheck, HealthContext, HealthFinding } from "../types.js";

const CHECK_ID = "phase-readiness";
const CHECK_NAME = "AEM Phase Readiness";

/** Checks AEM phase gate prerequisites for the current phase. */
export const phaseReadinessCheck: HealthCheck = {
  id: CHECK_ID,
  name: CHECK_NAME,
  description: "Checks whether AEM phase gate prerequisites are met for the current phase",

  run(ctx: HealthContext): HealthFinding[] {
    if (ctx.config.methodology !== "sap-aem") return [];

    const phase = readPhase(ctx.marvinDir);
    if (!phase) return [];

    const findings: HealthFinding[] = [];

    if (phase === "assess-use-case") {
      const useCases = ctx.store.list({ type: "use-case" });
      if (useCases.length === 0) {
        findings.push({
          checkId: CHECK_ID,
          checkName: CHECK_NAME,
          severity: "recommendation",
          message: "Phase 1 (Assess Use Case) is active but no use cases have been defined.",
          suggestion: "Use the PO persona to create use cases before advancing to Phase 2.",
        });
      } else {
        const drafts = useCases.filter((uc) => uc.frontmatter.status === "draft");
        if (drafts.length === useCases.length) {
          findings.push({
            checkId: CHECK_ID,
            checkName: CHECK_NAME,
            severity: "observation",
            message: `All ${drafts.length} use case(s) are still in draft status.`,
            suggestion:
              "Assess and approve use cases before advancing to Phase 2 (Assess Technology).",
          });
        }
      }
    }

    if (phase === "assess-technology") {
      const tas = ctx.store.list({ type: "tech-assessment" });
      const approvedUCs = ctx.store
        .list({ type: "use-case" })
        .filter(
          (uc) => uc.frontmatter.status === "assessed" || uc.frontmatter.status === "approved",
        );

      if (approvedUCs.length > 0 && tas.length === 0) {
        findings.push({
          checkId: CHECK_ID,
          checkName: CHECK_NAME,
          severity: "recommendation",
          message: `Phase 2 is active with ${approvedUCs.length} approved use case(s) but no tech assessments created.`,
          suggestion: "Use the TL persona to create tech assessments linked to approved use cases.",
        });
      }
    }

    if (phase === "define-solution") {
      const designs = ctx.store.list({ type: "extension-design" });
      const recommendedTAs = ctx.store
        .list({ type: "tech-assessment" })
        .filter((ta) => ta.frontmatter.status === "recommended");

      if (recommendedTAs.length > 0 && designs.length === 0) {
        findings.push({
          checkId: CHECK_ID,
          checkName: CHECK_NAME,
          severity: "recommendation",
          message: `Phase 3 is active with ${recommendedTAs.length} recommended tech assessment(s) but no extension designs created.`,
          suggestion:
            "Use the TL persona to create extension designs linked to recommended assessments.",
        });
      }
    }

    return findings;
  },
};

function readPhase(marvinDir: string): string | undefined {
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
