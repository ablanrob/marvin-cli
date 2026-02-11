import * as fs from "node:fs";
import * as path from "node:path";
import { ProjectNotFoundError } from "./errors.js";
import { loadProjectConfig, type MarvinProjectConfig } from "./config.js";

export interface MarvinProject {
  root: string;
  marvinDir: string;
  config: MarvinProjectConfig;
}

export function findProjectRoot(from: string = process.cwd()): string {
  let current = path.resolve(from);
  while (true) {
    const candidate = path.join(current, ".marvin");
    if (
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isDirectory()
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new ProjectNotFoundError(from);
    }
    current = parent;
  }
}

export function isMarvinProject(dir: string = process.cwd()): boolean {
  try {
    findProjectRoot(dir);
    return true;
  } catch {
    return false;
  }
}

export function loadProject(from: string = process.cwd()): MarvinProject {
  const root = findProjectRoot(from);
  const marvinDir = path.join(root, ".marvin");
  const config = loadProjectConfig(marvinDir);
  return { root, marvinDir, config };
}
