import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import type { ImportClassification } from "./types.js";

const RAW_SOURCE_EXTENSIONS = new Set([".pdf", ".txt"]);
const CORE_DIR_NAMES = new Set(["decisions", "actions", "questions"]);
const ID_PATTERN = /^[A-Z]+-\d{3,}$/;

export function classifyPath(
  inputPath: string,
  knownTypes: string[],
  knownDirNames: string[],
): ImportClassification {
  const resolved = path.resolve(inputPath);
  const stat = fs.statSync(resolved);

  if (!stat.isDirectory()) {
    return classifyFile(resolved, knownTypes);
  }

  // Check if it's a .marvin/ directory or contains config.yaml
  if (
    path.basename(resolved) === ".marvin" ||
    fs.existsSync(path.join(resolved, "config.yaml"))
  ) {
    return { type: "marvin-project", inputPath: resolved };
  }

  // Check if it contains known doc subdirectories
  const allDirNames = new Set([...CORE_DIR_NAMES, ...knownDirNames]);
  const entries = fs.readdirSync(resolved);
  const hasDocSubdirs = entries.some(
    (e) =>
      allDirNames.has(e) &&
      fs.statSync(path.join(resolved, e)).isDirectory(),
  );
  if (hasDocSubdirs) {
    return { type: "docs-directory", inputPath: resolved };
  }

  // Check if directory contains markdown files with valid frontmatter
  const mdFiles = entries.filter((e) => e.endsWith(".md"));
  if (mdFiles.length > 0) {
    const hasMarvinDocs = mdFiles.some((f) => {
      try {
        const raw = fs.readFileSync(path.join(resolved, f), "utf-8");
        const { data } = matter(raw);
        return isValidMarvinDocument(data, knownTypes);
      } catch {
        return false;
      }
    });
    if (hasMarvinDocs) {
      return { type: "docs-directory", inputPath: resolved };
    }
  }

  // Fallback: raw source directory
  return { type: "raw-source-dir", inputPath: resolved };
}

export function classifyFile(
  filePath: string,
  knownTypes: string[],
): ImportClassification {
  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved).toLowerCase();

  if (RAW_SOURCE_EXTENSIONS.has(ext)) {
    return { type: "raw-source-file", inputPath: resolved };
  }

  if (ext === ".md") {
    try {
      const raw = fs.readFileSync(resolved, "utf-8");
      const { data } = matter(raw);
      if (isValidMarvinDocument(data, knownTypes)) {
        return { type: "marvin-document", inputPath: resolved };
      }
    } catch {
      // Not a valid marvin doc, treat as raw source
    }
    return { type: "raw-source-file", inputPath: resolved };
  }

  return { type: "raw-source-file", inputPath: resolved };
}

export function isValidMarvinDocument(
  frontmatter: Record<string, unknown>,
  knownTypes: string[],
): boolean {
  const id = frontmatter.id;
  const type = frontmatter.type;

  if (typeof id !== "string" || typeof type !== "string") {
    return false;
  }

  if (!ID_PATTERN.test(id)) {
    return false;
  }

  return knownTypes.includes(type);
}
