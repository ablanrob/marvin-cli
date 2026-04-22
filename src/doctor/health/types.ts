import type { DocumentStore } from "../../storage/store.js";
import type { SourceManifestManager } from "../../sources/manifest.js";
import type { MarvinProjectConfig } from "../../core/config.js";

export type FindingSeverity = "recommendation" | "observation";

export interface HealthFinding {
  checkId: string;
  checkName: string;
  severity: FindingSeverity;
  message: string;
  suggestion: string;
}

export interface HealthContext {
  store: DocumentStore;
  config: MarvinProjectConfig;
  manifest?: SourceManifestManager;
  marvinDir: string;
}

export interface HealthCheck {
  id: string;
  name: string;
  description: string;
  run(ctx: HealthContext): HealthFinding[];
}

export interface HealthReport {
  checkedAt: string;
  totalFindings: number;
  findings: HealthFinding[];
  summary: {
    recommendations: number;
    observations: number;
    byCheck: Record<string, number>;
  };
}
