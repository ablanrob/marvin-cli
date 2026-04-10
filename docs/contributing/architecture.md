# Architecture Overview

This document describes how the Marvin codebase is organized, how the major subsystems interact, and where to look when working on different parts of the system.

## Layer diagram

```
┌─────────────────────────────────────────────────┐
│                   Entry Points                   │
│         bin/marvin.ts    bin/marvin-serve.ts     │
├──────────────────────┬──────────────────────────┤
│     CLI Layer        │     MCP Layer            │
│   src/cli/           │   src/mcp/               │
│   src/agent/session  │   src/agent/mcp-server   │
├──────────────────────┴──────────────────────────┤
│              Persona System                      │
│   src/personas/ (registry, prompt-builder)       │
├─────────────────────────────────────────────────┤
│          Plugins & Skills                        │
│   src/plugins/ (methodology plugins)             │
│   src/skills/  (composable capabilities)         │
├─────────────────────────────────────────────────┤
│              Core Services                       │
│   src/storage/ (DocumentStore, sessions)         │
│   src/sources/ (source manifest, ingest)         │
│   src/core/    (config, project, errors)         │
├─────────────────────────────────────────────────┤
│           Presentation                           │
│   src/web/     (dashboard server, templates)     │
│   src/reports/ (report generators)               │
└─────────────────────────────────────────────────┘
```

Dependencies flow downward. The core layer has no imports from upper layers. The CLI and MCP layers sit at the top and compose everything together.

## Entry points

Marvin has two entry points, both in `bin/`:

**marvin.ts** — The main CLI. Parses commands via Commander and dispatches to handlers in `src/cli/commands/`. For chat sessions, it calls `startSession()` from `src/agent/session.ts`, which creates an MCP server, builds a system prompt, and runs an interactive loop with the Claude API.

**marvin-serve.ts** — The standalone MCP server. Starts a stdio-based MCP server (`src/mcp/stdio-server.ts`) that Claude Desktop or Claude Code can connect to. This exposes all governance tools over the MCP protocol with persona validation.

## Core layer

**src/core/project.ts** — Project discovery. `findProjectRoot()` walks up the directory tree looking for `.marvin/`. `loadProject()` returns the project root, marvin directory path, and parsed config.

**src/core/config.ts** — Configuration loading. Handles both user-level config (`~/.config/marvin/config.yaml`) and project-level config (`.marvin/config.yaml`). Merges them together and resolves the API key from config or environment.

**src/core/errors.ts** — Error hierarchy. All custom errors extend `MarvinError`: `ProjectNotFoundError`, `ConfigError`, `ApiKeyMissingError`, `GitSyncError`, `ImportError`.

## Storage layer

**src/storage/store.ts** — The `DocumentStore` class. This is the heart of the data layer. It manages a flat-file document store where each artifact is a markdown file with YAML frontmatter in `.marvin/docs/{type}/`. Supports CRUD operations, ID generation (auto-incrementing per type), and querying by type, status, owner, and tags.

**src/storage/types.ts** — Document interfaces (`Document`, `DocumentFrontmatter`, `DocumentQuery`) and the core type registry.

**src/storage/document.ts** — Frontmatter parsing and serialization using `gray-matter`.

**src/storage/session-store.ts** — Chat session persistence. Stores session metadata in `.marvin/sessions.yaml`.

**src/storage/progress.ts** — Progress calculation utilities for artifacts with parent-child relationships (epics → features, sprints → actions).

## Persona system

**src/personas/types.ts** — The `PersonaDefinition` interface: ID, name, description, responsibilities, focus areas, allowed document types, contribution types, and system prompt.

**src/personas/registry.ts** — Persona lookup. `getPersona()` resolves a persona by ID or short name (`po`, `dm`, `tl`). `listPersonas()` returns all registered personas.

**src/personas/prompt-builder.ts** — Assembles the full system prompt for a session by combining the persona's base prompt with project context, available tools, plugin fragments, and skill fragments.

**src/personas/builtin/** — Built-in persona definitions (product-owner.ts, delivery-manager.ts, tech-lead.ts).

## Plugin system

Plugins represent methodologies and are the primary extension mechanism for document types and tools.

**src/plugins/types.ts** — The `MarvinPlugin` interface. A plugin provides an ID, name, optional persona definitions, a tool factory function, document type registrations, and prompt fragments.

**src/plugins/registry.ts** — Plugin resolution. `resolvePlugin()` looks up a built-in plugin by methodology ID. Currently two are built in: `generic-agile` and `sap-aem`.

**src/plugins/common.ts** — Shared registrations (meeting, report, feature, epic, contribution, sprint, task) and the `createCommonTools()` factory that both plugins use.

**src/plugins/builtin/** — Plugin definitions and tool implementations. Tools live in `builtin/tools/` and follow a consistent factory pattern: each file exports a `create*Tools(store)` function returning `SdkMcpToolDefinition[]`.

## Skill system

Skills are lighter than plugins — they add capabilities to specific personas without defining a full methodology.

**src/skills/types.ts** — `SkillDefinition` and `SkillAction` interfaces. Skills can provide tools, prompt fragments, document type registrations, and named actions (multi-turn conversations with a system prompt).

**src/skills/registry.ts** — Skill loading and resolution. `loadAllSkills()` discovers skills from three sources: built-in TypeScript skills, built-in SKILL.md directories, and project-level skills in `.marvin/skills/`. `resolveSkillsForPersona()` filters skills assigned to a given persona.

Built-in skills include `governance-review` (review open governance items), `jira` (bidirectional Jira sync), and `prd-generator` (generate product requirements documents).

## Agent tools

**src/agent/tools/** — MCP tool definitions for all governance operations. Each file defines tools for a specific domain: `decisions.ts`, `actions.ts`, `questions.ts`, `documents.ts`, `sources.ts`, `sessions.ts`, `web.ts`, `doctor.ts`.

All tools follow the same pattern:

```typescript
import { z } from "zod/v4";
import { tool } from "@anthropic-ai/claude-agent-sdk";

export function createDecisionTools(store: DocumentStore) {
  return [
    tool("list_decisions", "List all decisions", { /* Zod schema */ }, async (args) => {
      // Implementation using store
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }),
    // ...
  ];
}
```

## Web dashboard

**src/web/server.ts** — HTTP server setup. Loads the project, creates a DocumentStore, and starts a Node.js HTTP server.

**src/web/router.ts** — Request routing. Maps URL paths to page renderers. Supports persona-specific views (`/po/`, `/dm/`, `/tl/`) and API endpoints.

**src/web/templates/** — HTML template functions. The layout system generates full HTML pages with navigation, persona switching, and artifact rendering.

## Key design decisions

**Flat-file storage over a database.** Documents are markdown files with YAML frontmatter. This makes them human-readable, git-friendly, and easy to inspect or edit by hand. The trade-off is that complex queries require scanning files.

**Plugin-based methodologies.** Rather than hardcoding agile workflows, methodologies are plugins that register document types, tools, and prompt guidance. This keeps the core generic while allowing specialized workflows like SAP AEM.

**Persona-scoped access.** Each persona has a defined set of document types it can work with and contribution types it can submit. This isn't a security boundary — it's guidance that keeps each persona focused on its role.

**Skills as composable layers.** Skills can be mixed and matched across personas and methodologies. A Jira skill can be added to any persona in any methodology without modifying the plugin.
