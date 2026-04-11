import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedStyles: string | null = null;

export function renderStyles(): string {
  if (cachedStyles) return cachedStyles;

  // Resolve the bundled CSS file. In dev, this module lives at
  // `src/web/templates/styles.ts`, so `../static/styles.css` resolves to
  // `src/web/static/styles.css`. In production, tsup bundles every module
  // into a single file at `dist/marvin.js` (or `dist/marvin-serve.js`), and
  // the `copyStaticAssets` plugin copies the CSS to `dist/web/static/`.
  // After bundling, __dirname is `dist/`, so we need to look for
  // `web/static/styles.css` relative to it. The last two entries are
  // CWD-relative fallbacks that only help when running from the package
  // root (e.g. `npm run dev`).
  const candidates = [
    path.join(__dirname, "..", "static", "styles.css"), // dev source layout
    path.join(__dirname, "web", "static", "styles.css"), // bundled prod layout
    path.resolve("src/web/static/styles.css"),
    path.resolve("dist/web/static/styles.css"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      cachedStyles = fs.readFileSync(p, "utf-8");
      return cachedStyles;
    }
  }

  throw new Error(`styles.css not found. Searched: ${candidates.join(", ")}`);
}
