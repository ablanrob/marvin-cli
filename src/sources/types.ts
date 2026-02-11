export type SourceFileStatus = "pending" | "processing" | "completed" | "error";

export interface SourceFileEntry {
  hash: string;
  addedAt: string;
  processedAt: string | null;
  status: SourceFileStatus;
  artifacts: string[];
  error: string | null;
}

export interface SourceManifest {
  version: 1;
  files: Record<string, SourceFileEntry>;
}

export interface IngestOptions {
  marvinDir: string;
  fileName: string;
  draft: boolean;
  persona: string;
}

export interface IngestResult {
  fileName: string;
  artifacts: string[];
  draft: boolean;
}
