import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";

export interface SessionEntry {
  id: string;
  name: string;
  persona: string;
  created: string;
  lastUsed: string;
  turnCount: number;
}

export class SessionStore {
  private filePath: string;

  constructor(marvinDir: string) {
    this.filePath = path.join(marvinDir, "sessions.yaml");
  }

  list(): SessionEntry[] {
    const entries = this.load();
    return entries.sort(
      (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime(),
    );
  }

  get(name: string): SessionEntry | undefined {
    return this.load().find((e) => e.name === name);
  }

  getById(sessionId: string): SessionEntry | undefined {
    return this.load().find((e) => e.id === sessionId);
  }

  save(entry: SessionEntry): void {
    const entries = this.load();
    const idx = entries.findIndex((e) => e.name === entry.name);
    if (idx >= 0) {
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }
    this.write(entries);
  }

  delete(name: string): boolean {
    const entries = this.load();
    const idx = entries.findIndex((e) => e.name === name);
    if (idx < 0) return false;
    entries.splice(idx, 1);
    this.write(entries);
    return true;
  }

  updateLastUsed(name: string, turnCount: number): void {
    const entries = this.load();
    const entry = entries.find((e) => e.name === name);
    if (!entry) return;
    entry.lastUsed = new Date().toISOString();
    entry.turnCount = turnCount;
    this.write(entries);
  }

  private load(): SessionEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const parsed = YAML.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as SessionEntry[];
    } catch {
      return [];
    }
  }

  private write(entries: SessionEntry[]): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, YAML.stringify(entries), "utf-8");
  }
}
