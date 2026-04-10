# CLI Reference

Complete command reference for the Marvin CLI.

> **Note:** Run `marvin --help` or `marvin <command> --help` for the most up-to-date usage information.

<!-- TODO: Fill in detailed descriptions and examples for each command -->

## Core Commands

### `marvin init`

Initialize a new Marvin project in the current directory. Creates `.marvin/` with config and document directories.

### `marvin chat`

Start an interactive chat session with a persona.

| Option | Description |
|--------|-------------|
| `--as <persona>` | Persona to chat as (`po`, `dm`, `tl`) |
| `-p, --prompt <text>` | Send a one-off prompt instead of interactive mode |
| `--resume [name]` | Resume a saved session |

### `marvin sessions`

List saved chat sessions. Use `sessions delete <name>` to remove one.

### `marvin status`

Show project status and summary.

### `marvin config [key] [value]`

View or set configuration values.

## Document Processing

### `marvin ingest [file]`

Process source documents to extract governance artifacts.

| Option | Description |
|--------|-------------|
| `--all` | Process all unprocessed source files |
| `--draft` / `--no-draft` | Propose artifacts vs. create directly (default: draft) |
| `--as <persona>` | Persona for analysis (default: product-owner) |

### `marvin import <path>`

Import documents or sources from external paths.

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview without writing |
| `--conflict <strategy>` | ID conflict handling: `renumber`, `skip`, `overwrite` |
| `--tag <tag>` | Tag all imported documents |
| `--ingest` / `--no-ingest` | Trigger ingest after import |

### `marvin analyze <meeting-id>`

Analyze a meeting to extract decisions, actions, and questions.

### `marvin contribute`

Submit a structured contribution from a persona.

| Option | Description |
|--------|-------------|
| `--as <persona>` | Persona making the contribution (required) |
| `--type <type>` | Contribution type (required) |
| `--prompt <text>` | Contribution content (required) |
| `--about <id>` | Related artifact ID |

## Reporting

### `marvin report gar`

Generate a Green/Amber/Red status report. Supports `--format ascii` (default) or `--format confluence`.

### `marvin report health`

Generate a governance health check. Supports `--format ascii` or `--format confluence`.

### `marvin report sprint-summary`

Generate an AI-powered sprint summary. Use `--sprint <id>` to target a specific sprint and `--save` to persist it.

## Skills Management

### `marvin skills`

List all skills and their persona assignments.

### `marvin skills install <skill> --as <persona>`

Assign a skill to a persona.

### `marvin skills remove <skill> --as <persona>`

Unassign a skill from a persona.

### `marvin skills create <name>`

Scaffold a new skill in `.marvin/skills/`.

### `marvin skills migrate`

Migrate legacy YAML skills to SKILL.md format.

## Git & Sync

### `marvin sync init [--remote <url>]`

Initialize git in `.marvin/` for governance data versioning.

### `marvin sync status`

Show sync status.

### `marvin sync remote <url>`

Set or update the remote URL.

### `marvin clone <url> [directory]`

Clone governance data from a remote repository.

## Jira Integration

### `marvin jira sync [artifactId]`

Sync Jira-linked artifacts. Use `--dry-run` to preview.

### `marvin jira statuses [projectKey]`

Show Jira status mappings.

### `marvin jira daily`

Daily summary of Jira changes with Marvin cross-references. Supports `--from`, `--to`, and `--project` options.

## Utilities

### `marvin web`

Launch the local web dashboard. Use `-p <port>` to change the port (default: 3000) and `--no-open` to skip opening the browser.

### `marvin doctor`

Scan documents for structural issues. Use `--fix` to auto-repair and `--rule <rule>` to run a specific rule.

### `marvin generate claude-md`

Generate `.marvin/CLAUDE.md` project instructions. Use `--force` to overwrite.

### `marvin serve`

Start standalone MCP server for Claude Desktop or Claude Code. Use `--project-dir` to specify the project location.
