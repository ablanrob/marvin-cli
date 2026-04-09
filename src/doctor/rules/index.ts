import type { DoctorRule } from "../types.js";
import { tagMigrationRule } from "./tag-migration.js";
import { arrayNormalizationRule } from "./array-normalization.js";
import { missingAutoTagsRule } from "./missing-auto-tags.js";
import { progressConsistencyRule } from "./progress-consistency.js";
import { orphanedReferencesRule } from "./orphaned-references.js";
import { ownerRoleRule } from "./owner-role.js";
import { statusAlignmentRule } from "./status-alignment.js";

/** Rules in dependency order — earlier rules may fix data that later rules inspect */
export const allRules: DoctorRule[] = [
  statusAlignmentRule,
  tagMigrationRule,
  arrayNormalizationRule,
  missingAutoTagsRule,
  progressConsistencyRule,
  orphanedReferencesRule,
  ownerRoleRule,
];
