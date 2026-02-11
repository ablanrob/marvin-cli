import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as YAML from "yaml";
import type {
  SourceManifest,
  SourceFileEntry,
  SourceFileStatus,
} from "./types.js";

const MANIFEST_FILE = ".manifest.yaml";
const SOURCE_EXTENSIONS = [".pdf", ".md", ".txt"];

function emptyManifest(): SourceManifest {
  return { version: 1, files: {} };
}

export class SourceManifestManager {
  private manifest: SourceManifest;
  private manifestPath: string;
  readonly sourcesDir: string;

  constructor(marvinDir: string) {
    this.sourcesDir = path.join(marvinDir, "sources");
    this.manifestPath = path.join(this.sourcesDir, MANIFEST_FILE);
    this.manifest = this.load();
  }

  private load(): SourceManifest {
    if (!fs.existsSync(this.manifestPath)) {
      return emptyManifest();
    }
    const raw = fs.readFileSync(this.manifestPath, "utf-8");
    const parsed = YAML.parse(raw) as SourceManifest | null;
    return parsed ?? emptyManifest();
  }

  save(): void {
    fs.mkdirSync(this.sourcesDir, { recursive: true });
    fs.writeFileSync(this.manifestPath, YAML.stringify(this.manifest), "utf-8");
  }

  scan(): { added: string[]; changed: string[]; removed: string[] } {
    const added: string[] = [];
    const changed: string[] = [];
    const removed: string[] = [];

    if (!fs.existsSync(this.sourcesDir)) {
      return { added, changed, removed };
    }

    const onDisk = new Set(
      fs
        .readdirSync(this.sourcesDir)
        .filter((f) => {
          const ext = path.extname(f).toLowerCase();
          return SOURCE_EXTENSIONS.includes(ext);
        }),
    );

    // Detect new and changed files
    for (const fileName of onDisk) {
      const filePath = path.join(this.sourcesDir, fileName);
      const hash = this.hashFile(filePath);
      const existing = this.manifest.files[fileName];

      if (!existing) {
        this.manifest.files[fileName] = {
          hash,
          addedAt: new Date().toISOString(),
          processedAt: null,
          status: "pending",
          artifacts: [],
          error: null,
        };
        added.push(fileName);
      } else if (existing.hash !== hash) {
        existing.hash = hash;
        existing.status = "pending";
        existing.processedAt = null;
        existing.artifacts = [];
        existing.error = null;
        changed.push(fileName);
      }
    }

    // Detect removed files
    for (const fileName of Object.keys(this.manifest.files)) {
      if (!onDisk.has(fileName)) {
        removed.push(fileName);
        delete this.manifest.files[fileName];
      }
    }

    this.save();
    return { added, changed, removed };
  }

  list(status?: SourceFileStatus): Array<{ name: string; entry: SourceFileEntry }> {
    return Object.entries(this.manifest.files)
      .filter(([, entry]) => !status || entry.status === status)
      .map(([name, entry]) => ({ name, entry }));
  }

  get(fileName: string): SourceFileEntry | undefined {
    return this.manifest.files[fileName];
  }

  unprocessed(): string[] {
    return Object.entries(this.manifest.files)
      .filter(([, entry]) => entry.status === "pending" || entry.status === "error")
      .map(([name]) => name);
  }

  markProcessing(fileName: string): void {
    const entry = this.manifest.files[fileName];
    if (!entry) throw new Error(`Source file "${fileName}" not in manifest`);
    entry.status = "processing";
    this.save();
  }

  markCompleted(fileName: string, artifacts: string[]): void {
    const entry = this.manifest.files[fileName];
    if (!entry) throw new Error(`Source file "${fileName}" not in manifest`);
    entry.status = "completed";
    entry.processedAt = new Date().toISOString();
    entry.artifacts = artifacts;
    entry.error = null;
    this.save();
  }

  markError(fileName: string, error: string): void {
    const entry = this.manifest.files[fileName];
    if (!entry) throw new Error(`Source file "${fileName}" not in manifest`);
    entry.status = "error";
    entry.error = error;
    this.save();
  }

  private hashFile(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  }
}
