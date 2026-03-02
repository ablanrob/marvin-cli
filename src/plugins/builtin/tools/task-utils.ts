/**
 * Normalize linkedEpic from frontmatter: handles undefined, single string,
 * JSON-stringified array, or array.
 * Always returns a string array for uniform downstream handling.
 *
 * Claude sometimes serializes arrays as JSON strings when calling MCP tools,
 * so a value like '["E-001","E-002"]' is parsed back into an array.
 */
export function normalizeLinkedEpics(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    } catch { /* not JSON — treat as a single epic ID */ }
    return [value];
  }
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

/** Map epic IDs to epic:<id> tags for task tagging */
export function generateEpicTags(epics: string[]): string[] {
  return epics.map((id) => `epic:${id}`);
}
