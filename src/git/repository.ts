import * as path from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { GitSyncError } from "../core/errors.js";

export interface GitStatus {
  isRepo: boolean;
  hasRemote: boolean;
  remoteUrl?: string;
  branch: string;
  modified: string[];
  created: string[];
  deleted: string[];
  ahead: number;
  behind: number;
  conflicted: string[];
}

export interface SyncResult {
  committed: boolean;
  commitMessage?: string;
  pulled: boolean;
  pushed: boolean;
  conflicts: string[];
  filesChanged: number;
}

const MARVIN_GITIGNORE = `node_modules/
.DS_Store
Thumbs.db
*.tmp
*.swp
`;

/** Map directory names (under docs/) to human-readable type labels for commit messages. */
const DIR_TYPE_LABELS: Record<string, string> = {
  decisions: "decision",
  actions: "action",
  questions: "question",
  meetings: "meeting",
  reports: "report",
  features: "feature",
  epics: "epic",
};

function buildCommitMessage(files: string[]): string {
  const counts = new Map<string, number>();
  for (const f of files) {
    const parts = f.split(path.sep).join("/").split("/");
    const docsIdx = parts.indexOf("docs");
    if (docsIdx !== -1 && docsIdx + 1 < parts.length) {
      const dirName = parts[docsIdx + 1];
      const label = DIR_TYPE_LABELS[dirName] ?? dirName;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    } else {
      counts.set("file", (counts.get("file") ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return "Update governance data";
  }

  const parts: string[] = [];
  for (const [label, count] of counts) {
    parts.push(`${count} ${label}${count > 1 ? "s" : ""}`);
  }
  return `Update ${parts.join(", ")}`;
}

export class MarvinGit {
  private git: SimpleGit;
  private marvinDir: string;

  constructor(marvinDir: string) {
    this.marvinDir = marvinDir;
    this.git = simpleGit({ baseDir: marvinDir });
  }

  async isRepository(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  async init(remote?: string): Promise<void> {
    if (await this.isRepository()) {
      throw new GitSyncError(
        "Git repository already initialized in .marvin/",
      );
    }

    await this.git.init();

    // Create .gitignore
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      path.join(this.marvinDir, ".gitignore"),
      MARVIN_GITIGNORE,
      "utf-8",
    );

    // Stage all and make initial commit
    await this.git.add(".");
    await this.git.commit("Initial commit — marvin governance data");

    if (remote) {
      await this.git.addRemote("origin", remote);
    }
  }

  async setRemote(url: string): Promise<void> {
    try {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((r) => r.name === "origin");
      if (origin) {
        await this.git.remote(["set-url", "origin", url]);
      } else {
        await this.git.addRemote("origin", url);
      }
    } catch (err) {
      throw new GitSyncError(`Failed to set remote: ${err}`);
    }
  }

  async status(): Promise<GitStatus> {
    const isRepo = await this.isRepository();
    if (!isRepo) {
      return {
        isRepo: false,
        hasRemote: false,
        branch: "",
        modified: [],
        created: [],
        deleted: [],
        ahead: 0,
        behind: 0,
        conflicted: [],
      };
    }

    try {
      const st = await this.git.status();
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((r) => r.name === "origin");

      return {
        isRepo: true,
        hasRemote: !!origin,
        remoteUrl: origin?.refs?.push,
        branch: st.current ?? "main",
        modified: st.modified,
        created: [...st.not_added, ...st.created],
        deleted: st.deleted,
        ahead: st.ahead,
        behind: st.behind,
        conflicted: st.conflicted,
      };
    } catch (err) {
      throw new GitSyncError(`Failed to get git status: ${err}`);
    }
  }

  async sync(): Promise<SyncResult> {
    if (!(await this.isRepository())) {
      throw new GitSyncError(
        'Git not initialized in .marvin/. Run "marvin sync init" first.',
      );
    }

    const result: SyncResult = {
      committed: false,
      pulled: false,
      pushed: false,
      conflicts: [],
      filesChanged: 0,
    };

    try {
      // Stage all changes
      await this.git.add(".");
      const st = await this.git.status();

      const changedFiles = [
        ...st.staged,
        ...st.created,
        ...st.modified,
        ...st.deleted,
        ...st.renamed.map((r) => r.to),
      ];

      // Commit if there are staged changes
      if (st.staged.length > 0) {
        const message = buildCommitMessage(st.staged);
        await this.git.commit(message);
        result.committed = true;
        result.commitMessage = message;
        result.filesChanged = st.staged.length;
      }

      // Pull and push only if remote exists
      const remotes = await this.git.getRemotes(true);
      const hasRemote = remotes.some((r) => r.name === "origin");

      if (hasRemote) {
        try {
          await this.git.pull("origin", undefined, { "--rebase": null });
          result.pulled = true;
        } catch (err) {
          // Check for conflicts
          const postPullStatus = await this.git.status();
          if (postPullStatus.conflicted.length > 0) {
            result.conflicts = postPullStatus.conflicted;
            throw new GitSyncError(
              `Merge conflicts in ${postPullStatus.conflicted.length} file(s): ${postPullStatus.conflicted.join(", ")}. ` +
                `Resolve conflicts in .marvin/ and run "marvin sync" again.`,
            );
          }
          throw new GitSyncError(`Failed to pull: ${err}`);
        }

        try {
          await this.git.push("origin");
          result.pushed = true;
        } catch (err) {
          throw new GitSyncError(
            `Failed to push: ${err}. Try pulling first or check remote access.`,
          );
        }
      }

      return result;
    } catch (err) {
      if (err instanceof GitSyncError) throw err;
      throw new GitSyncError(`Sync failed: ${err}`);
    }
  }

  static async clone(url: string, targetDir: string): Promise<string> {
    const marvinDir = path.join(targetDir, ".marvin");

    const { existsSync } = await import("node:fs");
    if (existsSync(marvinDir)) {
      throw new GitSyncError(
        `.marvin/ already exists at ${targetDir}. Remove it first or choose a different directory.`,
      );
    }

    try {
      await simpleGit().clone(url, marvinDir);
      return marvinDir;
    } catch (err) {
      throw new GitSyncError(`Clone failed: ${err}`);
    }
  }
}
