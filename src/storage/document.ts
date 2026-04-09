import matter from "gray-matter";
import type { Document, DocumentFrontmatter } from "./types.js";

export function parseDocument(raw: string, filePath: string): Document {
  const { data, content } = matter(raw);
  return {
    frontmatter: data as DocumentFrontmatter,
    content: content.trim(),
    filePath,
  };
}

/**
 * Replace literal backslash-n sequences with actual newlines.
 * This normalizes content from agent tools that double-escape newlines
 * (e.g., sending `\\n` in JSON, which parses to the two characters `\n`).
 */
function normalizeLiteralNewlines(text: string): string {
  return text.replace(/\\n/g, "\n");
}

export function serializeDocument(doc: Document): string {
  const content = doc.content ? normalizeLiteralNewlines(doc.content) : "";
  return matter.stringify(content ? `\n${content}\n` : "\n", doc.frontmatter);
}
