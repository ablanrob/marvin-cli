import matter from "gray-matter";
import type { Document, DocumentFrontmatter } from "./types.js";

export function parseDocument(
  raw: string,
  filePath: string,
): Document {
  const { data, content } = matter(raw);
  return {
    frontmatter: data as DocumentFrontmatter,
    content: content.trim(),
    filePath,
  };
}

export function serializeDocument(doc: Document): string {
  return matter.stringify(
    doc.content ? `\n${doc.content}\n` : "\n",
    doc.frontmatter,
  );
}
