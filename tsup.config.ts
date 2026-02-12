import { defineConfig } from "tsup";
import pkg from "./package.json";

const define = { "process.env.APP_VERSION": JSON.stringify(pkg.version) };

export default defineConfig([
  {
    entry: ["bin/marvin.ts"],
    format: ["esm"],
    splitting: false,
    sourcemap: true,
    clean: true,
    target: "node20",
    define,
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
  },
  {
    entry: ["bin/marvin-serve.ts"],
    format: ["esm"],
    splitting: false,
    sourcemap: true,
    target: "node20",
    define,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
