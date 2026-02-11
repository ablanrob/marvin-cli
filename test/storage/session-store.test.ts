import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SessionStore, type SessionEntry } from "../../src/storage/session-store.js";

describe("SessionStore", () => {
  let tmpDir: string;
  let marvinDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-session-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(marvinDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
    return {
      id: "sess-123",
      name: "test-session",
      persona: "product-owner",
      created: "2026-02-10T10:00:00.000Z",
      lastUsed: "2026-02-10T10:00:00.000Z",
      turnCount: 5,
      ...overrides,
    };
  }

  it("should return empty list when no sessions file exists", () => {
    const store = new SessionStore(marvinDir);
    expect(store.list()).toEqual([]);
  });

  it("should save and retrieve a session by name", () => {
    const store = new SessionStore(marvinDir);
    const entry = makeEntry();

    store.save(entry);

    const retrieved = store.get("test-session");
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe("sess-123");
    expect(retrieved!.persona).toBe("product-owner");
    expect(retrieved!.turnCount).toBe(5);
  });

  it("should retrieve a session by ID", () => {
    const store = new SessionStore(marvinDir);
    store.save(makeEntry());

    const retrieved = store.getById("sess-123");
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe("test-session");
  });

  it("should return undefined for non-existent name", () => {
    const store = new SessionStore(marvinDir);
    expect(store.get("nope")).toBeUndefined();
  });

  it("should return undefined for non-existent session ID", () => {
    const store = new SessionStore(marvinDir);
    expect(store.getById("nope")).toBeUndefined();
  });

  it("should list sessions sorted by lastUsed descending", () => {
    const store = new SessionStore(marvinDir);

    store.save(makeEntry({
      name: "old-session",
      id: "sess-1",
      lastUsed: "2026-02-08T10:00:00.000Z",
    }));
    store.save(makeEntry({
      name: "new-session",
      id: "sess-2",
      lastUsed: "2026-02-10T10:00:00.000Z",
    }));
    store.save(makeEntry({
      name: "mid-session",
      id: "sess-3",
      lastUsed: "2026-02-09T10:00:00.000Z",
    }));

    const list = store.list();
    expect(list).toHaveLength(3);
    expect(list[0].name).toBe("new-session");
    expect(list[1].name).toBe("mid-session");
    expect(list[2].name).toBe("old-session");
  });

  it("should overwrite existing session with same name", () => {
    const store = new SessionStore(marvinDir);

    store.save(makeEntry({ turnCount: 5 }));
    store.save(makeEntry({ turnCount: 12 }));

    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].turnCount).toBe(12);
  });

  it("should delete a session by name", () => {
    const store = new SessionStore(marvinDir);
    store.save(makeEntry());

    const result = store.delete("test-session");
    expect(result).toBe(true);
    expect(store.list()).toHaveLength(0);
  });

  it("should return false when deleting non-existent session", () => {
    const store = new SessionStore(marvinDir);
    expect(store.delete("nope")).toBe(false);
  });

  it("should update lastUsed and turnCount", () => {
    const store = new SessionStore(marvinDir);
    store.save(makeEntry({
      lastUsed: "2026-02-08T10:00:00.000Z",
      turnCount: 3,
    }));

    store.updateLastUsed("test-session", 10);

    const entry = store.get("test-session")!;
    expect(entry.turnCount).toBe(10);
    expect(new Date(entry.lastUsed).getTime()).toBeGreaterThan(
      new Date("2026-02-08T10:00:00.000Z").getTime(),
    );
  });

  it("should handle corrupt YAML gracefully", () => {
    fs.writeFileSync(path.join(marvinDir, "sessions.yaml"), ":::invalid", "utf-8");
    const store = new SessionStore(marvinDir);
    expect(store.list()).toEqual([]);
  });

  it("should handle non-array YAML gracefully", () => {
    fs.writeFileSync(path.join(marvinDir, "sessions.yaml"), "key: value\n", "utf-8");
    const store = new SessionStore(marvinDir);
    expect(store.list()).toEqual([]);
  });

  it("should create marvinDir if it does not exist when saving", () => {
    const nestedDir = path.join(tmpDir, "deep", "nested", ".marvin");
    const store = new SessionStore(nestedDir);

    store.save(makeEntry());

    expect(fs.existsSync(path.join(nestedDir, "sessions.yaml"))).toBe(true);
  });

  it("should persist across store instances", () => {
    const store1 = new SessionStore(marvinDir);
    store1.save(makeEntry());

    const store2 = new SessionStore(marvinDir);
    expect(store2.get("test-session")).toBeDefined();
  });
});
