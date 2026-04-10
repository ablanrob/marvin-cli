# Plugin Development

Plugins are how Marvin defines methodologies. A plugin registers document types, provides tools for working with those types, and injects prompt guidance into personas. Currently plugins are built-in (defined in TypeScript within `src/plugins/builtin/`), but the interface is designed for future external plugin support.

## Plugin interface

A plugin implements the `MarvinPlugin` interface:

```typescript
interface MarvinPlugin {
  id: string;                    // Unique ID (e.g., "generic-agile")
  name: string;                  // Display name
  description: string;
  version: string;

  // Document types this plugin adds
  documentTypes?: string[];
  documentTypeRegistrations?: DocumentTypeRegistration[];

  // Tool factory — receives a DocumentStore, returns MCP tools
  tools?: (store: DocumentStore, marvinDir?: string) => SdkMcpToolDefinition<any>[];

  // Prompt fragments keyed by persona ID (or "*" for all personas)
  promptFragments?: Record<string, string>;

  // Additional persona definitions (optional)
  personas?: PersonaDefinition[];

  // Lifecycle hook
  onLoad?: () => Promise<void>;
}
```

## Registering document types

Each document type needs a registration that maps it to a directory name and ID prefix:

```typescript
const registrations: DocumentTypeRegistration[] = [
  { type: "feature",  dirName: "features",  idPrefix: "F"  },
  { type: "epic",     dirName: "epics",     idPrefix: "E"  },
  { type: "sprint",   dirName: "sprints",   idPrefix: "SP" },
];
```

These registrations tell the `DocumentStore` where to store files and how to generate IDs. When a user creates a feature, it gets saved as `.marvin/docs/features/F-001.md`.

## Writing tools

Tools follow the Claude Agent SDK pattern with Zod v4 schemas:

```typescript
import { z } from "zod/v4";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";

export function createFeatureTools(store: DocumentStore) {
  return [
    tool(
      "list_features",                              // snake_case name
      "List all features, optionally filtered",     // concise description
      {
        status: z.enum(["draft", "approved", "deferred", "done"])
          .optional()
          .describe("Filter by status"),
      },
      async (args) => {
        const docs = store.list({ type: "feature", status: args.status });
        return {
          content: [{ type: "text", text: JSON.stringify(docs) }],
        };
      },
    ),
  ];
}
```

Conventions to follow:

- Tool names use `snake_case` (e.g., `create_feature`, `list_sprints`)
- Descriptions are concise and action-oriented
- Input schemas use Zod v4 with `.describe()` on each field
- Read-only tools should include `{ annotations: { readOnlyHint: true } }`
- Return format is always `{ content: [{ type: "text", text: string }] }`

## Prompt fragments

Prompt fragments inject methodology-specific guidance into persona system prompts:

```typescript
const plugin: MarvinPlugin = {
  // ...
  promptFragments: {
    "product-owner": "Focus on user stories and acceptance criteria...",
    "delivery-manager": "Track velocity and burndown metrics...",
    "*": "This project follows Scrum with 2-week sprints.",
  },
};
```

The `"*"` key applies to all personas. Persona-specific keys override or supplement it.

## Existing plugins

**generic-agile** — The default. Adds meetings, reports, features, epics, sprints, tasks, and contributions. Provides prompt guidance for all three personas about agile practices.

**sap-aem** — Extends generic-agile with SAP Application Extension Methodology. Adds use cases, tech assessments, and extension designs. Includes phase management (Discover → Prepare → Explore → Realize → Deploy → Run) and SAP BTP-specific guidance.

## Adding a new plugin

1. Create a new file in `src/plugins/builtin/` (e.g., `my-methodology.ts`)
2. Define document type registrations
3. Create tool factories in `src/plugins/builtin/tools/`
4. Implement the `MarvinPlugin` interface
5. Register it in `src/plugins/registry.ts` by adding it to the `BUILTIN_PLUGINS` map
6. Add tests in `test/plugins/`

See `src/plugins/builtin/generic-agile.ts` as the reference implementation.
