import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as YAML from "yaml";
import { MarvinGit } from "../../src/git/repository.js";
import { GitSyncError } from "../../src/core/errors.js";

function createMarvinDir(tmpDir: string): string {
  const marvinDir = path.join(tmpDir, ".marvin");
  fs.mkdirSync(path.join(marvinDir, "docs", "decisions"), { recursive: true });
  fs.mkdirSync(path.join(marvinDir, "docs", "actions"), { recursive: true });
  fs.mkdirSync(path.join(marvinDir, "docs", "features"), { recursive: true });
  fs.writeFileSync(
    path.join(marvinDir, "config.yaml"),
    YAML.stringify({ name: "test-project" }),
    "utf-8",
  );
  return marvinDir;
}

describe("MarvinGit", () => {
  let tmpDir: string;
  let marvinDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-git-test-"));
    marvinDir = createMarvinDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("isRepository", () => {
    it("should return false before init", async () => {
      const git = new MarvinGit(marvinDir);
      expect(await git.isRepository()).toBe(false);
    });

    it("should return true after init", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init();
      expect(await git.isRepository()).toBe(true);
    });
  });

  describe("init", () => {
    it("should create .git/ and .gitignore inside .marvin/", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init();

      expect(fs.existsSync(path.join(marvinDir, ".git"))).toBe(true);
      expect(fs.existsSync(path.join(marvinDir, ".gitignore"))).toBe(true);

      const gitignore = fs.readFileSync(
        path.join(marvinDir, ".gitignore"),
        "utf-8",
      );
      expect(gitignore).toContain("node_modules/");
      expect(gitignore).toContain(".DS_Store");
    });

    it("should make initial commit with all existing files", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init();

      const status = await git.status();
      expect(status.isRepo).toBe(true);
      expect(status.modified).toHaveLength(0);
      expect(status.created).toHaveLength(0);
    });

    it("should set remote if provided", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init("https://github.com/test/repo.git");

      const status = await git.status();
      expect(status.hasRemote).toBe(true);
      expect(status.remoteUrl).toBe("https://github.com/test/repo.git");
    });

    it("should throw GitSyncError if already initialized", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init();
      await expect(git.init()).rejects.toThrow(GitSyncError);
    });
  });

  describe("status", () => {
    it("should return isRepo false for uninitialized directory", async () => {
      const git = new MarvinGit(marvinDir);
      const status = await git.status();
      expect(status.isRepo).toBe(false);
    });

    it("should detect new files after changes", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init();

      // Create a new file after init
      fs.writeFileSync(
        path.join(marvinDir, "docs", "decisions", "D-001.md"),
        "---\nid: D-001\ntitle: Test\n---\nContent",
        "utf-8",
      );

      const status = await git.status();
      expect(status.created.length + status.modified.length).toBeGreaterThan(0);
    });

    it("should detect modified files", async () => {
      // Create a file, init, then modify it
      fs.writeFileSync(
        path.join(marvinDir, "docs", "decisions", "D-001.md"),
        "---\nid: D-001\ntitle: Test\n---\nOriginal",
        "utf-8",
      );

      const git = new MarvinGit(marvinDir);
      await git.init();

      // Modify the file
      fs.writeFileSync(
        path.join(marvinDir, "docs", "decisions", "D-001.md"),
        "---\nid: D-001\ntitle: Test\n---\nModified",
        "utf-8",
      );

      const status = await git.status();
      expect(status.modified).toContain("docs/decisions/D-001.md");
    });

    it("should report remote info when set", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init("https://example.com/repo.git");

      const status = await git.status();
      expect(status.hasRemote).toBe(true);
      expect(status.remoteUrl).toBe("https://example.com/repo.git");
    });
  });

  describe("setRemote", () => {
    it("should add a new remote", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init();
      await git.setRemote("https://example.com/new-repo.git");

      const status = await git.status();
      expect(status.hasRemote).toBe(true);
      expect(status.remoteUrl).toBe("https://example.com/new-repo.git");
    });

    it("should update existing remote URL", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init("https://example.com/old-repo.git");
      await git.setRemote("https://example.com/new-repo.git");

      const status = await git.status();
      expect(status.remoteUrl).toBe("https://example.com/new-repo.git");
    });
  });

  describe("sync", () => {
    it("should throw if not a repo", async () => {
      const git = new MarvinGit(marvinDir);
      await expect(git.sync()).rejects.toThrow(GitSyncError);
    });

    it("should be a no-op when no changes", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init();

      const result = await git.sync();
      expect(result.committed).toBe(false);
      expect(result.filesChanged).toBe(0);
    });

    it("should commit new files with descriptive message", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init();

      // Add some document files
      fs.writeFileSync(
        path.join(marvinDir, "docs", "decisions", "D-001.md"),
        "---\nid: D-001\ntitle: Test Decision\n---\n",
        "utf-8",
      );
      fs.writeFileSync(
        path.join(marvinDir, "docs", "decisions", "D-002.md"),
        "---\nid: D-002\ntitle: Another Decision\n---\n",
        "utf-8",
      );
      fs.writeFileSync(
        path.join(marvinDir, "docs", "actions", "A-001.md"),
        "---\nid: A-001\ntitle: Test Action\n---\n",
        "utf-8",
      );

      const result = await git.sync();
      expect(result.committed).toBe(true);
      expect(result.commitMessage).toContain("decision");
      expect(result.commitMessage).toContain("action");
      expect(result.filesChanged).toBe(3);
    });

    it("should handle local-only repo (no push when no remote)", async () => {
      const git = new MarvinGit(marvinDir);
      await git.init();

      fs.writeFileSync(
        path.join(marvinDir, "docs", "features", "F-001.md"),
        "---\nid: F-001\ntitle: Auth\n---\n",
        "utf-8",
      );

      const result = await git.sync();
      expect(result.committed).toBe(true);
      expect(result.pushed).toBe(false);
      expect(result.pulled).toBe(false);
    });
  });

  describe("clone", () => {
    it("should throw if .marvin/ already exists at target", async () => {
      // marvinDir already exists from beforeEach
      await expect(
        MarvinGit.clone("https://example.com/repo.git", tmpDir),
      ).rejects.toThrow(GitSyncError);
      await expect(
        MarvinGit.clone("https://example.com/repo.git", tmpDir),
      ).rejects.toThrow(".marvin/ already exists");
    });
  });
});
