import type { DocumentStore } from "../storage/store.js";
import type { Document } from "../storage/types.js";

export type IssueSeverity = "error" | "warning" | "info";

export interface DoctorIssue {
  ruleId: string;
  ruleName: string;
  documentId: string;
  filePath: string;
  documentType: string;
  message: string;
  severity: IssueSeverity;
  fixable: boolean;
}

export interface DoctorFix {
  issue: DoctorIssue;
  fixDescription: string;
}

export interface DoctorContext {
  store: DocumentStore;
  allDocuments: Document[];
  documentIndex: Map<string, Document>;
}

export interface DoctorRule {
  id: string;
  name: string;
  description: string;
  scan(ctx: DoctorContext): DoctorIssue[];
  fix(ctx: DoctorContext): DoctorFix[];
}

export interface DoctorReport {
  scannedAt: string;
  totalDocuments: number;
  issues: DoctorIssue[];
  fixes: DoctorFix[];
  summary: {
    totalIssues: number;
    fixableIssues: number;
    fixedIssues: number;
    byRule: Record<string, number>;
    bySeverity: Record<IssueSeverity, number>;
  };
}
