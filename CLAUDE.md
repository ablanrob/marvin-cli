# CLAUDE.md — Marvin CLI Development Guide

This file provides coding conventions and project context for AI-assisted development with Claude Code.

## Project Overview

Marvin (`mrvn-cli`) is an AI-powered software product development assistant that provides Product Owner, Delivery Manager, and Technical Lead personas. It is built as a TypeScript CLI tool and MCP server on the Claude Agent SDK.

## Tech Stack

- **Language:** TypeScript 5.x (strict mode)
- **Runtime:** Node.js ≥ 20, ESM-only (`"type": "module"`)
- **Build:** tsup (multi-entry: `bin/marvin.ts`, `bin/marvin-serve.ts`, `src/index.ts`)
- **Test:** Vitest (with globals enabled)
- **Agent SDK:** `@anthropic-ai/claude-agent-sdk`
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **CLI framework:** Commander.js with `@commander-js/extra-typings`

## Repository Structure

```
bin/            CLI entry points (marvin.ts, marvin-serve.ts)
src/
  agent/        MCP server, session management, agent tools
  analysis/     Analysis utilities
  cli/          CLI command definitions
  contributions/ Contribution tracking
  core/         Project config, errors, project resolution
  doctor/       Health check rules engine
  git/          Git integration via simple-git
  import/       Data import utilities
  mcp/          MCP protocol implementation
  personas/     Persona definitions, prompt builder, registry
  plugins/      Plugin system (registry, builtin tools, types)
  reports/      Report generation
  skills/       Skill system (definitions, loading, migration)
  sources/      Source manifest management
  storage/      Document store, frontmatter parsing, types
  templates/    Template engine
  web/          Web dashboard (HTML templates, server)
test/           Mirrors src/ structure for test files
```

## Commands

```bash
npm run build       # Build with tsup
npm run dev         # Run CLI in dev mode via tsx
npm test            # Run all tests (vitest run)
npm run test:watch  # Run tests in watch mode
npm run typecheck   # TypeScript type checking (tsc --noEmit)
npm run lint        # ESLint check
npm run lint:fix    # ESLint auto-fix
npm run format      # Prettier format check
npm run format:fix  # Prettier auto-format
```

## Coding Conventions

### TypeScript

- **Strict mode is mandatory.** Never use `@ts-ignore` or `any` unless absolutely unavoidable — prefer `unknown` with type narrowing.
- Use `.js` extensions in import paths (required for ESM resolution with bundler moduleResolution).
- Prefer named exports over default exports.
- Use `node:` protocol for Node.js built-in imports (e.g., `import * as fs from "node:fs"`).
- Define explicit return types on all exported functions and public methods.
- Use `interface` for object shapes, `type` for unions/intersections/aliases.

### Naming

- Files: `kebab-case.ts` (e.g., `session-store.ts`, `prompt-builder.ts`)
- Classes: `PascalCase` (e.g., `DocumentStore`, `SessionStore`)
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` for module-level constants
- Types/Interfaces: `PascalCase` (e.g., `DocumentQuery`, `PersonaDefinition`)
- Test files: `<module-name>.test.ts` mirroring the source path

### Code Style

- Use `const` by default; `let` only when reassignment is necessary; never `var`.
- Prefer early returns and guard clauses over deeply nested conditionals.
- Use template literals instead of string concatenation.
- Use optional chaining (`?.`) and nullish coalescing (`??`) over manual null checks.
- Keep functions focused — aim for single responsibility and <50 lines where possible.
- Avoid side effects in constructors; prefer factory functions or init methods for async setup.

### Error Handling

- Use the project's error hierarchy in `src/core/errors.ts` (`MarvinError`, `ProjectNotFoundError`, `ConfigError`, `ApiKeyMissingError`).
- Throw typed errors, never plain strings.
- Catch errors at the appropriate boundary (CLI command handlers, MCP tool handlers), not deep in business logic.

### Testing

- Use Vitest with globals (`describe`, `it`, `expect`, `beforeEach`, `afterEach`).
- Tests go in `test/` mirroring the `src/` directory structure.
- Each test creates a temp directory (`fs.mkdtempSync`) and cleans up in `afterEach`.
- Test file imports use relative paths to `src/` (e.g., `../../../src/storage/store.js`).
- Prefer focused unit tests over broad integration tests.
- Every new feature or bugfix must include tests.

### Plugin/Tool Authoring

- Tools are created using `tool()` from `@anthropic-ai/claude-agent-sdk`.
- Tool input schemas use Zod v4 (`import { z } from "zod/v4"`).
- Tool factory functions take a `DocumentStore` and return `SdkMcpToolDefinition<any>[]`.
- Tool names use `snake_case` (e.g., `list_sprints`, `create_epic`).
- Tool descriptions should be concise and action-oriented.

### Commits

- Write clear, descriptive commit messages: `type: short description`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`
- Keep commits atomic — one logical change per commit.
- PRs should target the `main` branch.

## Security

- Never commit `.env` files, API keys, or credentials.
- The `.gitignore` excludes `.env`, `node_modules/`, `dist/`, `.marvin/`, `.claude/`.
- Validate and sanitize all user input in CLI commands and MCP tool handlers.
- Use `node:crypto` for any cryptographic operations, never custom implementations.

## Dependencies

- Be conservative with new dependencies. Prefer Node.js built-ins when sufficient.
- Any new dependency must be justified in the PR description.
- Pin exact versions for production dependencies where possible.
- Keep `devDependencies` separate from `dependencies`.

## CI/CD

- GitHub Actions CI runs on every push to `main` and on PRs.
- CI pipeline: lint → typecheck → build → test (with coverage) → security audit.
- CodeRabbit provides automated code reviews on PRs.
- All CI checks must pass before merging.
