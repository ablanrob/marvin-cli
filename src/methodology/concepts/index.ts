import type { ConceptDefinition } from "../types.js";
import { phaseConcepts } from "./phases.js";
import { ritualConcepts } from "./rituals.js";
import { artifactTypeConcepts } from "./artifact-types.js";
import { roleConcepts } from "./roles.js";

export const ALL_CONCEPTS: ConceptDefinition[] = [
  ...phaseConcepts,
  ...ritualConcepts,
  ...artifactTypeConcepts,
  ...roleConcepts,
];

export { phaseConcepts } from "./phases.js";
export { ritualConcepts } from "./rituals.js";
export { artifactTypeConcepts } from "./artifact-types.js";
export { roleConcepts } from "./roles.js";
