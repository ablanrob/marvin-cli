import type { DocumentFrontmatter, DocumentType } from "../storage/types.js";

export type ConflictStrategy = "renumber" | "skip" | "overwrite";

export interface ImportOptions {
  dryRun: boolean;
  conflict: ConflictStrategy;
  tag?: string;
  ingest: boolean;
  as: string;
  draft: boolean;
}

export type ImportClassificationType =
  | "marvin-project"
  | "docs-directory"
  | "marvin-document"
  | "raw-source-dir"
  | "raw-source-file";

export interface ImportClassification {
  type: ImportClassificationType;
  inputPath: string;
}

export type ImportPlanItemAction = "import" | "copy" | "skip";

export interface ImportPlanItem {
  action: ImportPlanItemAction;
  sourcePath: string;
  targetPath: string;
  documentType?: DocumentType;
  originalId?: string;
  newId?: string;
  reason?: string;
  frontmatter?: DocumentFrontmatter;
  content?: string;
}

export interface ImportPlan {
  classification: ImportClassification;
  items: ImportPlanItem[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  copied: number;
  items: ImportPlanItem[];
}
