# Marvin CLI

AI-powered product development assistant. Marvin provides three expert personas — **Product Owner**, **Delivery Manager**, and **Technical Lead** — that help teams manage features, epics, tasks, sprints, decisions, actions, questions, meetings, and reports through an interactive CLI backed by Claude.

## Quick Start

```bash
# Install globally
npm install -g mrvn-cli

# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# Initialize a project
marvin init

# Start a chat session
marvin chat --as po     # Product Owner
marvin chat --as dm     # Delivery Manager
marvin chat --as tl     # Technical Lead
```

## How It Works

Marvin stores project governance data as **Markdown files with YAML frontmatter** inside a `.marvin/` directory — human-readable, Git-friendly, and Obsidian-compatible. Each artifact gets an auto-incrementing ID (`F-001`, `E-001`, `SP-001`, `D-001`, etc.).

When you start a chat session, Marvin loads a persona-specific system prompt, exposes your project data as **MCP tools** that Claude can call, and starts an interactive conversation where the agent reads, creates, and updates artifacts on your behalf.

```
.marvin/
├── config.yaml              # Project configuration
├── sessions.yaml            # Saved chat sessions
├── skills/                  # Custom skills
├── sources/                 # Source documents for ingestion
└── docs/
    ├── features/            # F-001.md, F-002.md, ...
    ├── epics/               # E-001.md, E-002.md, ...
    ├── tasks/               # T-001.md, T-002.md, ...
    ├── sprints/             # SP-001.md, SP-002.md, ...
    ├── decisions/           # D-001.md, D-002.md, ...
    ├── actions/             # A-001.md, A-002.md, ...
    ├── questions/           # Q-001.md, Q-002.md, ...
    ├── meetings/            # M-001.md, M-002.md, ...
    └── ...
```

## Personas

| Short | Full Name | Focus |
|-------|-----------|-------|
| `po` | Product Owner | Product vision, feature prioritization, stakeholder needs, acceptance criteria |
| `dm` | Delivery Manager | Sprint planning, epic scheduling, risk management, governance, meeting facilitation |
| `tl` | Technical Lead | Architecture, epic/task scoping, code quality, technical decisions |

Each persona has a tuned system prompt and access to governance tools for managing artifacts — plus methodology-specific tools when a plugin is active.

## Key Features

**Structured workflow** — Product Owner defines features, Tech Lead breaks them into epics and tasks, Delivery Manager plans sprints and tracks progress. Hard validation enforces that epics link to approved features.

**Two methodologies** — Generic Agile (default) for standard agile, and SAP Application Extension Methodology for SAP BTP projects with use cases, tech assessments, and extension designs.

**Skills** — Composable capabilities that extend any persona: Jira integration (bidirectional sync), PRD generation (for Claude TaskMaster or Claude Code), and governance review. Create custom skills with the SKILL.md format.

**Source ingestion** — Drop PDFs, markdown, or text files into `.marvin/sources/` and run `marvin ingest --all` to extract governance artifacts using AI analysis.

**Web dashboard** — `marvin web` launches a local dashboard with persona-specific views, sprint boards, GAR reports, and artifact detail pages.

**MCP server** — `marvin serve` starts a standalone MCP server for Claude Desktop or Claude Code, giving Claude direct access to all governance tools.

**Git sync** — Version and share governance data independently from your codebase with `marvin sync`.

**Reports** — GAR (Green/Amber/Red) status reports, health checks, and AI-powered sprint summaries.

## Documentation

Full documentation is in the [`docs/`](docs/) directory:

**For users:**

- [Getting Started](docs/guides/getting-started.md) — install, initialize, first session
- [Personas](docs/guides/personas.md) — what each persona does and when to use it
- [CLI Reference](docs/reference/cli.md) — complete command reference
- [Configuration](docs/reference/configuration.md) — user and project config options
- [Document Types](docs/reference/document-types.md) — all artifact types and their fields
- [Skills](docs/guides/skills.md) — using and creating skills
- [Jira Integration](docs/guides/jira.md) — bidirectional Jira sync
- [Web Dashboard](docs/guides/web-dashboard.md) — local web UI
- [MCP Server](docs/guides/mcp-server.md) — use with Claude Desktop/Code

**For contributors:**

- [Architecture Overview](docs/contributing/architecture.md) — codebase structure and design
- [Plugin Development](docs/contributing/plugins.md) — building methodology plugins
- [Skill Development](docs/contributing/skills.md) — creating skills with SKILL.md
- [Testing](docs/contributing/testing.md) — test conventions and patterns

## Development

```bash
npm run build        # Build with tsup
npm run dev          # Run via tsx (no build needed)
npm test             # Run tests with Vitest
npm run typecheck    # Type check
npm run lint         # ESLint
npm run format       # Prettier check
```

## Tech Stack

TypeScript (ESM, Node 20+), Claude Agent SDK, Commander.js, Markdown + YAML frontmatter storage, Vitest, tsup.

## License

MIT License with Commons Clause. You can use, modify, and distribute Marvin freely — the Commons Clause restricts selling Marvin itself as a service or product.
