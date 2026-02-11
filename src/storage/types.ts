export type DocumentType = string;

export const CORE_DOCUMENT_TYPES = ["decision", "action", "question"] as const;

export interface DocumentTypeRegistration {
  type: string;
  dirName: string;
  idPrefix: string;
}

export interface DocumentFrontmatter {
  id: string;
  title: string;
  type: DocumentType;
  status: string;
  created: string;
  updated: string;
  owner?: string;
  priority?: string;
  tags?: string[];
  source?: string;
  [key: string]: unknown;
}

export interface Document {
  frontmatter: DocumentFrontmatter;
  content: string;
  filePath: string;
}

export interface DocumentQuery {
  type?: DocumentType;
  status?: string;
  owner?: string;
  tag?: string;
}
