import * as fs from "node:fs";
import * as path from "node:path";
import { parseDocument, serializeDocument } from "./document.js";
import type {
  Document,
  DocumentFrontmatter,
  DocumentQuery,
  DocumentType,
  DocumentTypeRegistration,
} from "./types.js";

const CORE_TYPE_DIRS: Record<string, string> = {
  decision: "decisions",
  action: "actions",
  question: "questions",
};

const CORE_ID_PREFIXES: Record<string, string> = {
  decision: "D",
  action: "A",
  question: "Q",
};

export class DocumentStore {
  private docsDir: string;
  private index: Map<string, DocumentFrontmatter> = new Map();
  private typeDirs: Record<string, string>;
  private idPrefixes: Record<string, string>;

  constructor(marvinDir: string, registrations?: DocumentTypeRegistration[]) {
    this.docsDir = path.join(marvinDir, "docs");
    this.typeDirs = { ...CORE_TYPE_DIRS };
    this.idPrefixes = { ...CORE_ID_PREFIXES };
    for (const reg of registrations ?? []) {
      this.typeDirs[reg.type] = reg.dirName;
      this.idPrefixes[reg.type] = reg.idPrefix;
    }
    this.buildIndex();
  }

  get registeredTypes(): string[] {
    return Object.keys(this.typeDirs);
  }

  private buildIndex(): void {
    this.index.clear();
    for (const type of Object.keys(this.typeDirs)) {
      const dir = path.join(this.docsDir, this.typeDirs[type]);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const raw = fs.readFileSync(filePath, "utf-8");
        const doc = parseDocument(raw, filePath);
        if (doc.frontmatter.id) {
          this.index.set(doc.frontmatter.id, doc.frontmatter);
        }
      }
    }
  }

  list(query?: DocumentQuery): Document[] {
    const results: Document[] = [];
    const types = query?.type
      ? [query.type]
      : Object.keys(this.typeDirs);

    for (const type of types) {
      const dirName = this.typeDirs[type];
      if (!dirName) continue;
      const dir = path.join(this.docsDir, dirName);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const raw = fs.readFileSync(filePath, "utf-8");
        const doc = parseDocument(raw, filePath);

        if (query?.status && doc.frontmatter.status !== query.status) continue;
        if (query?.owner && doc.frontmatter.owner !== query.owner) continue;
        if (
          query?.tag &&
          (!doc.frontmatter.tags || !doc.frontmatter.tags.includes(query.tag))
        )
          continue;

        results.push(doc);
      }
    }

    return results;
  }

  get(id: string): Document | undefined {
    for (const type of Object.keys(this.typeDirs)) {
      const dir = path.join(this.docsDir, this.typeDirs[type]);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const raw = fs.readFileSync(filePath, "utf-8");
        const doc = parseDocument(raw, filePath);
        if (doc.frontmatter.id === id) return doc;
      }
    }
    return undefined;
  }

  create(
    type: DocumentType,
    frontmatter: Partial<DocumentFrontmatter>,
    content: string = "",
  ): Document {
    const id = this.nextId(type);
    const now = new Date().toISOString();
    const dirName = this.typeDirs[type];
    if (!dirName) {
      throw new Error(`Unknown document type: ${type}`);
    }
    const dir = path.join(this.docsDir, dirName);
    fs.mkdirSync(dir, { recursive: true });

    // Strip undefined values so they don't override defaults when spread
    const cleaned = Object.fromEntries(
      Object.entries(frontmatter).filter(([, v]) => v !== undefined),
    );

    const fullFrontmatter: DocumentFrontmatter = {
      id,
      title: "Untitled",
      type,
      status: "open",
      created: now,
      updated: now,
      ...cleaned,
    };

    const fileName =
      type === "meeting"
        ? `${now.slice(0, 10)}-${slugify(fullFrontmatter.title)}.md`
        : `${id}.md`;
    const filePath = path.join(dir, fileName);

    const doc: Document = {
      frontmatter: fullFrontmatter,
      content,
      filePath,
    };

    fs.writeFileSync(filePath, serializeDocument(doc), "utf-8");
    this.index.set(id, fullFrontmatter);
    return doc;
  }

  importDocument(
    type: DocumentType,
    frontmatter: DocumentFrontmatter,
    content: string = "",
  ): Document {
    const dirName = this.typeDirs[type];
    if (!dirName) {
      throw new Error(`Unknown document type: ${type}`);
    }

    const existing = this.get(frontmatter.id);
    if (existing) {
      throw new Error(
        `Document ${frontmatter.id} already exists. Resolve conflicts before importing.`,
      );
    }

    const dir = path.join(this.docsDir, dirName);
    fs.mkdirSync(dir, { recursive: true });

    const fileName =
      type === "meeting"
        ? `${frontmatter.created.slice(0, 10)}-${slugify(frontmatter.title)}.md`
        : `${frontmatter.id}.md`;
    const filePath = path.join(dir, fileName);

    const doc: Document = { frontmatter, content, filePath };
    fs.writeFileSync(filePath, serializeDocument(doc), "utf-8");
    this.index.set(frontmatter.id, frontmatter);
    return doc;
  }

  update(
    id: string,
    updates: Partial<DocumentFrontmatter>,
    content?: string,
  ): Document {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Document ${id} not found`);
    }

    const cleanedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    );

    const updatedFrontmatter: DocumentFrontmatter = {
      ...existing.frontmatter,
      ...cleanedUpdates,
      updated: new Date().toISOString(),
    };

    const doc: Document = {
      frontmatter: updatedFrontmatter,
      content: content ?? existing.content,
      filePath: existing.filePath,
    };

    fs.writeFileSync(existing.filePath, serializeDocument(doc), "utf-8");
    this.index.set(id, updatedFrontmatter);
    return doc;
  }

  nextId(type: DocumentType): string {
    const prefix = this.idPrefixes[type];
    if (!prefix) {
      throw new Error(`Unknown document type: ${type}`);
    }
    const dirName = this.typeDirs[type];
    const dir = path.join(this.docsDir, dirName);
    if (!fs.existsSync(dir)) return `${prefix}-001`;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    let maxNum = 0;
    for (const file of files) {
      const match = file.match(new RegExp(`^${prefix}-(\\d+)\\.md$`));
      if (match) {
        maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
    }
    return `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
  }

  counts(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const type of Object.keys(this.typeDirs)) {
      const dir = path.join(this.docsDir, this.typeDirs[type]);
      if (!fs.existsSync(dir)) {
        result[type] = 0;
        continue;
      }
      result[type] = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).length;
    }
    return result;
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
