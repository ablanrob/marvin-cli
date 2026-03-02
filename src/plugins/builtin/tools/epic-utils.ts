/**
 * Normalize linkedFeature from frontmatter: handles undefined, single string, or array.
 * Always returns a string array for uniform downstream handling.
 */
export function normalizeLinkedFeatures(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

/** Map feature IDs to feature:<id> tags for epic tagging */
export function generateFeatureTags(features: string[]): string[] {
  return features.map((id) => `feature:${id}`);
}
