import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedStyles: string | null = null;

export function renderStyles(): string {
  if (!cachedStyles) {
    // Resolve relative to this module: ../static/styles.css
    // Works both in dev (src/web/templates/) and prod (dist/web/templates/ or equivalent)
    const candidates = [
      path.join(__dirname, "..", "static", "styles.css"),
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
  return cachedStyles;
}
