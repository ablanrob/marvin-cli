# Testing

<!-- TODO: Expand with more patterns and examples -->

Marvin uses Vitest with globals enabled. Tests live in `test/` mirroring the `src/` directory structure.

## Running tests

```bash
npm test              # run all tests
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

## Conventions

- Test files are named `<module>.test.ts` and mirror the source path
- Each test creates a temporary directory with `fs.mkdtempSync` and cleans up in `afterEach`
- Imports use relative paths to `src/` (e.g., `../../../src/storage/store.js`)
- Use Vitest globals: `describe`, `it`, `expect`, `beforeEach`, `afterEach`

## Test structure

Most tests follow this pattern:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("My Feature", () => {
  let tmpDir: string;
  let store: DocumentStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    const marvinDir = path.join(tmpDir, ".marvin");
    // Create required directories
    for (const dir of ["decisions", "actions", "questions"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should do something", async () => {
    // ...
  });
});
```

## Coverage gaps

Priority areas that need tests: `src/core/` (config, project, errors), `src/storage/` (DocumentStore, sessions), `src/agent/` (session, MCP server), and `src/personas/` (registry, prompt builder). See [Architecture Overview](architecture.md) for module descriptions.
