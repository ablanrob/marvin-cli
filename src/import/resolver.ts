import type { DocumentStore } from "../storage/store.js";
import type { DocumentFrontmatter } from "../storage/types.js";
import type { ConflictStrategy } from "./types.js";

export interface ResolvedDocument {
  frontmatter: DocumentFrontmatter;
  content: string;
  originalId: string;
  newId: string;
}

export interface ResolveResult {
  resolved: ResolvedDocument[];
  skipped: string[];
  idMapping: Map<string, string>;
}

const ID_REF_PATTERN = /\b([A-Z]+-\d{3,})\b/g;

export function resolveConflicts(
  incoming: Array<{ frontmatter: DocumentFrontmatter; content: string }>,
  store: DocumentStore,
  strategy: ConflictStrategy,
): ResolveResult {
  const resolved: ResolvedDocument[] = [];
  const skipped: string[] = [];
  const idMapping = new Map<string, string>();

  for (const doc of incoming) {
    const originalId = doc.frontmatter.id;
    const existing = store.get(originalId);

    if (!existing) {
      // No conflict — keep original ID
      resolved.push({
        frontmatter: doc.frontmatter,
        content: doc.content,
        originalId,
        newId: originalId,
      });
      idMapping.set(originalId, originalId);
      continue;
    }

    switch (strategy) {
      case "skip": {
        skipped.push(originalId);
        break;
      }
      case "overwrite": {
        resolved.push({
          frontmatter: doc.frontmatter,
          content: doc.content,
          originalId,
          newId: originalId,
        });
        idMapping.set(originalId, originalId);
        break;
      }
      case "renumber": {
        const newId = store.nextId(doc.frontmatter.type);
        const updatedFrontmatter = { ...doc.frontmatter, id: newId };
        resolved.push({
          frontmatter: updatedFrontmatter,
          content: doc.content,
          originalId,
          newId,
        });
        idMapping.set(originalId, newId);
        break;
      }
    }
  }

  return { resolved, skipped, idMapping };
}

export function updateCrossReferences(
  content: string,
  idMapping: Map<string, string>,
): string {
  if (idMapping.size === 0) return content;

  return content.replace(ID_REF_PATTERN, (match) => {
    return idMapping.get(match) ?? match;
  });
}
