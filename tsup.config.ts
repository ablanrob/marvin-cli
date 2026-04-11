import { defineConfig, type Options } from "tsup";
import * as fs from "node:fs";
import * as path from "node:path";
import pkg from "./package.json";

const define = { "process.env.APP_VERSION": JSON.stringify(pkg.version) };

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const copyStaticAssets: Options["plugins"] = [
  {
    name: "copy-static-assets",
    buildEnd() {
      // Builtin skill SKILL.md directories
      const skillsSrc = path.resolve("src/skills/builtin/governance-review");
      const skillsDest = path.resolve("dist/skills/builtin/governance-review");
      if (fs.existsSync(skillsSrc)) {
        copyDirSync(skillsSrc, skillsDest);
      }

      // Web static assets (CSS)
      const webSrc = path.resolve("src/web/static");
      const webDest = path.resolve("dist/web/static");
      if (fs.existsSync(webSrc)) {
        copyDirSync(webSrc, webDest);
      }
    },
  },
];

export default defineConfig([
  {
    entry: ["bin/marvin.ts"],
    format: ["esm"],
    splitting: false,
    sourcemap: true,
    clean: true,
    target: "node20",
    define,
    plugins: copyStaticAssets,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    target: "node20",
    define,
    plugins: copyStaticAssets,
  },
  {
    entry: ["bin/marvin-serve.ts"],
    format: ["esm"],
    splitting: false,
    sourcemap: true,
    target: "node20",
    define,
    plugins: copyStaticAssets,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
