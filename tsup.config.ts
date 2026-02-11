import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["bin/marvin.ts"],
    format: ["esm"],
    splitting: false,
    sourcemap: true,
    clean: true,
    target: "node20",
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
  },
  {
    entry: ["bin/marvin-serve.ts"],
    format: ["esm"],
    splitting: false,
    sourcemap: true,
    target: "node20",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
