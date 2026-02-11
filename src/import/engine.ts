import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import type { DocumentStore } from "../storage/store.js";
import type { DocumentFrontmatter } from "../storage/types.js";
import { classifyPath, isValidMarvinDocument } from "./classifier.js";
import { resolveConflicts, updateCrossReferences } from "./resolver.js";
import type {
  ImportClassification,
  ImportOptions,
  ImportPlan,
  ImportPlanItem,
  ImportResult,
} from "./types.js";

export function buildImportPlan(
  inputPath: string,
  store: DocumentStore,
  marvinDir: string,
  options: ImportOptions,
): ImportPlan {
  const knownTypes = store.registeredTypes;
  const knownDirNames = knownTypes.map((t) => getDirNameForType(store, t));
  const classification = classifyPath(inputPath, knownTypes, knownDirNames);

  const items: ImportPlanItem[] = [];

  switch (classification.type) {
    case "marvin-project":
      items.push(
        ...planFromMarvinProject(classification, store, marvinDir, options),
      );
      break;
    case "docs-directory":
      items.push(
        ...planFromDocsDirectory(classification, store, marvinDir, options),
      );
      break;
    case "marvin-document":
      items.push(
        ...planFromSingleDocument(classification, store, marvinDir, options),
      );
      break;
    case "raw-source-dir":
      items.push(
        ...planFromRawSourceDir(classification, marvinDir),
      );
      break;
    case "raw-source-file":
      items.push(
        ...planFromRawSourceFile(classification, marvinDir),
      );
      break;
  }

  return { classification, items };
}

export function executeImportPlan(
  plan: ImportPlan,
  store: DocumentStore,
  marvinDir: string,
  options: ImportOptions,
): ImportResult {
  let imported = 0;
  let skipped = 0;
  let copied = 0;

  for (const item of plan.items) {
    if (item.action === "skip") {
      skipped++;
      continue;
    }

    if (item.action === "copy") {
      const targetDir = path.dirname(item.targetPath);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(item.sourcePath, item.targetPath);
      copied++;
      continue;
    }

    // action === "import"
    if (item.frontmatter && item.content !== undefined) {
      const fm = { ...item.frontmatter };
      if (options.tag) {
        fm.tags = [...(fm.tags ?? []), options.tag];
      }
      if (item.newId) {
        fm.id = item.newId;
      }

      const existing = store.get(fm.id);
      if (existing && options.conflict === "overwrite") {
        store.update(fm.id, fm, item.content);
      } else {
        store.importDocument(fm.type, fm, item.content);
      }
      imported++;
    }
  }

  return { imported, skipped, copied, items: plan.items };
}

export function formatPlanSummary(plan: ImportPlan): string {
  const lines: string[] = [];
  const typeLabel = classificationLabel(plan.classification.type);
  lines.push(`Detected: ${typeLabel}`);
  lines.push(`Source:   ${plan.classification.inputPath}`);
  lines.push("");

  const imports = plan.items.filter((i) => i.action === "import");
  const copies = plan.items.filter((i) => i.action === "copy");
  const skips = plan.items.filter((i) => i.action === "skip");

  if (imports.length > 0) {
    lines.push(`Documents to import: ${imports.length}`);
    for (const item of imports) {
      const idInfo =
        item.originalId !== item.newId
          ? `${item.originalId} → ${item.newId}`
          : item.newId ?? item.originalId ?? "";
      lines.push(`  ${idInfo}  ${path.basename(item.sourcePath)}`);
    }
  }

  if (copies.length > 0) {
    lines.push(`Files to copy to sources/: ${copies.length}`);
    for (const item of copies) {
      lines.push(`  ${path.basename(item.sourcePath)} → ${path.basename(item.targetPath)}`);
    }
  }

  if (skips.length > 0) {
    lines.push(`Skipped (conflict): ${skips.length}`);
    for (const item of skips) {
      lines.push(`  ${item.originalId ?? path.basename(item.sourcePath)}  ${item.reason ?? ""}`);
    }
  }

  if (plan.items.length === 0) {
    lines.push("Nothing to import.");
  }

  return lines.join("\n");
}

// --- Internal helpers ---

function classificationLabel(type: string): string {
  const labels: Record<string, string> = {
    "marvin-project": "Marvin project",
    "docs-directory": "Documents directory",
    "marvin-document": "Marvin document",
    "raw-source-dir": "Raw source directory",
    "raw-source-file": "Raw source file",
  };
  return labels[type] ?? type;
}

function getDirNameForType(store: DocumentStore, type: string): string {
  // Use the store's type → dir mapping via listing docs and checking directory names
  // Since registeredTypes gives us the types, we use the convention that
  // the dir name is the plural form, but we can also just call list to check.
  // For now, we use the convention from CORE_TYPE_DIRS + registered types.
  // The store doesn't expose typeDirs directly, so we rely on the dir names
  // matching the convention.
  const typeDir: Record<string, string> = {
    decision: "decisions",
    action: "actions",
    question: "questions",
    meeting: "meetings",
    report: "reports",
    feature: "features",
    epic: "epics",
  };
  return typeDir[type] ?? `${type}s`;
}

function collectMarvinDocs(
  dir: string,
  knownTypes: string[],
): Array<{ frontmatter: DocumentFrontmatter; content: string; sourcePath: string }> {
  const docs: Array<{ frontmatter: DocumentFrontmatter; content: string; sourcePath: string }> = [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(raw);
      if (isValidMarvinDocument(data, knownTypes)) {
        docs.push({
          frontmatter: data as DocumentFrontmatter,
          content: content.trim(),
          sourcePath: filePath,
        });
      }
    } catch {
      // Skip unparseable files
    }
  }

  return docs;
}

function planDocImports(
  docs: Array<{ frontmatter: DocumentFrontmatter; content: string; sourcePath: string }>,
  store: DocumentStore,
  options: ImportOptions,
): ImportPlanItem[] {
  const incoming = docs.map((d) => ({
    frontmatter: d.frontmatter,
    content: d.content,
  }));

  const { resolved, skipped, idMapping } = resolveConflicts(
    incoming,
    store,
    options.conflict,
  );

  const items: ImportPlanItem[] = [];

  // Map resolved docs back to source paths
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    // Find the matching source doc by original ID
    const sourceDoc = docs.find((d) => d.frontmatter.id === r.originalId);
    if (!sourceDoc) continue;

    const updatedContent = updateCrossReferences(r.content, idMapping);

    items.push({
      action: "import",
      sourcePath: sourceDoc.sourcePath,
      targetPath: "", // Will be determined by store.importDocument
      documentType: r.frontmatter.type,
      originalId: r.originalId,
      newId: r.newId,
      frontmatter: r.frontmatter,
      content: updatedContent,
    });
  }

  // Add skipped items
  for (const id of skipped) {
    const sourceDoc = docs.find((d) => d.frontmatter.id === id);
    items.push({
      action: "skip",
      sourcePath: sourceDoc?.sourcePath ?? "",
      targetPath: "",
      originalId: id,
      reason: "ID conflict (skip strategy)",
    });
  }

  return items;
}

function planFromMarvinProject(
  classification: ImportClassification,
  store: DocumentStore,
  _marvinDir: string,
  options: ImportOptions,
): ImportPlanItem[] {
  let projectDir = classification.inputPath;

  // If pointed at a directory containing .marvin/, look inside
  if (path.basename(projectDir) !== ".marvin") {
    const inner = path.join(projectDir, ".marvin");
    if (fs.existsSync(inner)) {
      projectDir = inner;
    }
  }

  const docsDir = path.join(projectDir, "docs");
  if (!fs.existsSync(docsDir)) {
    return [];
  }

  const knownTypes = store.registeredTypes;
  const allDocs: Array<{ frontmatter: DocumentFrontmatter; content: string; sourcePath: string }> = [];

  const subdirs = fs.readdirSync(docsDir).filter((d) =>
    fs.statSync(path.join(docsDir, d)).isDirectory(),
  );

  for (const subdir of subdirs) {
    const docs = collectMarvinDocs(path.join(docsDir, subdir), knownTypes);
    allDocs.push(...docs);
  }

  return planDocImports(allDocs, store, options);
}

function planFromDocsDirectory(
  classification: ImportClassification,
  store: DocumentStore,
  _marvinDir: string,
  options: ImportOptions,
): ImportPlanItem[] {
  const dir = classification.inputPath;
  const knownTypes = store.registeredTypes;
  const allDocs: Array<{ frontmatter: DocumentFrontmatter; content: string; sourcePath: string }> = [];

  // Collect from top level
  allDocs.push(...collectMarvinDocs(dir, knownTypes));

  // Collect from subdirectories (e.g., decisions/, actions/)
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    if (fs.statSync(entryPath).isDirectory()) {
      allDocs.push(...collectMarvinDocs(entryPath, knownTypes));
    }
  }

  return planDocImports(allDocs, store, options);
}

function planFromSingleDocument(
  classification: ImportClassification,
  store: DocumentStore,
  _marvinDir: string,
  options: ImportOptions,
): ImportPlanItem[] {
  const filePath = classification.inputPath;
  const knownTypes = store.registeredTypes;
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  if (!isValidMarvinDocument(data, knownTypes)) {
    return [];
  }

  const docs = [
    {
      frontmatter: data as DocumentFrontmatter,
      content: content.trim(),
      sourcePath: filePath,
    },
  ];

  return planDocImports(docs, store, options);
}

function planFromRawSourceDir(
  classification: ImportClassification,
  marvinDir: string,
): ImportPlanItem[] {
  const dir = classification.inputPath;
  const sourcesDir = path.join(marvinDir, "sources");
  const items: ImportPlanItem[] = [];

  const files = fs.readdirSync(dir).filter((f) => {
    const stat = fs.statSync(path.join(dir, f));
    return stat.isFile();
  });

  for (const file of files) {
    const sourcePath = path.join(dir, file);
    const targetPath = resolveSourceFileName(sourcesDir, file);

    items.push({
      action: "copy",
      sourcePath,
      targetPath,
    });
  }

  return items;
}

function planFromRawSourceFile(
  classification: ImportClassification,
  marvinDir: string,
): ImportPlanItem[] {
  const sourcesDir = path.join(marvinDir, "sources");
  const fileName = path.basename(classification.inputPath);
  const targetPath = resolveSourceFileName(sourcesDir, fileName);

  return [
    {
      action: "copy",
      sourcePath: classification.inputPath,
      targetPath,
    },
  ];
}

function resolveSourceFileName(sourcesDir: string, fileName: string): string {
  const targetPath = path.join(sourcesDir, fileName);
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }

  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let counter = 1;
  let candidate: string;
  do {
    candidate = path.join(sourcesDir, `${base}-${counter}${ext}`);
    counter++;
  } while (fs.existsSync(candidate));

  return candidate;
}
