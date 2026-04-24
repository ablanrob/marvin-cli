import type { HealthCheck } from "../types.js";
import { emptyProjectCheck } from "./empty-project.js";
import { unprocessedSourcesCheck } from "./unprocessed-sources.js";
import { noDiscoveriesCheck } from "./no-discoveries.js";
import { noSprintsCheck } from "./no-sprints.js";
import { unassignedActionsCheck } from "./unassigned-actions.js";
import { noJiraProjectCheck } from "./no-jira-project.js";
import { phaseReadinessCheck } from "./phase-readiness.js";

/** Health checks in priority order — most actionable first. */
export const allHealthChecks: HealthCheck[] = [
  emptyProjectCheck,
  unprocessedSourcesCheck,
  noDiscoveriesCheck,
  noSprintsCheck,
  unassignedActionsCheck,
  noJiraProjectCheck,
  phaseReadinessCheck,
];
