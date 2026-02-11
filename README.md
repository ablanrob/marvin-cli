# Marvin CLI

AI-powered product development assistant. Marvin provides three expert personas — **Product Owner**, **Delivery Manager**, and **Technical Lead** — that help teams manage features, epics, decisions, actions, questions, and meetings through an interactive CLI backed by Claude.

## Quick Start

```bash
# Install dependencies
npm install

# Initialize a project
npx tsx bin/marvin.ts init

# Check project status
npx tsx bin/marvin.ts status

# Start a chat session
npx tsx bin/marvin.ts chat --as po     # Product Owner
npx tsx bin/marvin.ts chat --as dm     # Delivery Manager
npx tsx bin/marvin.ts chat --as tl     # Technical Lead
```

## How It Works

Marvin stores all project governance data as **Markdown files with YAML frontmatter** inside a `.marvin/` directory. Each artifact gets its own file with an auto-incrementing ID (`F-001`, `E-001`, `D-001`, `A-002`, `Q-003`). This makes everything human-readable, Git-friendly, and Obsidian-compatible.

When you start a chat session, Marvin:

1. Loads a persona-specific system prompt (Product Owner focuses on value and stakeholders; Delivery Manager on risks and status; Tech Lead on architecture and quality)
2. Exposes your project's governance data as **MCP tools** that Claude can call
3. Starts an interactive conversation where the agent can read, create, and update project artifacts

```
.marvin/
├── config.yaml                # Project configuration
├── sessions.yaml              # Saved chat sessions
├── templates/                 # Document templates
├── sources/                   # Source documents for ingestion
│   ├── .manifest.yaml         # Tracks processing state
│   ├── Requirements.pdf       # Source document
│   └── Architecture Notes.md  # Source document
└── docs/
    ├── features/              # F-001.md, F-002.md, ...
    ├── epics/                 # E-001.md, E-002.md, ...
    ├── decisions/             # D-001.md, D-002.md, ...
    ├── actions/               # A-001.md, A-002.md, ...
    ├── questions/             # Q-001.md, Q-002.md, ...
    ├── meetings/              # 2026-02-08-kickoff.md, ...
    ├── reports/               # R-001.md, R-002.md, ...
    ├── use-cases/             # UC-001.md, UC-002.md, ... (SAP AEM)
    ├── tech-assessments/      # TA-001.md, TA-002.md, ... (SAP AEM)
    └── extension-designs/     # XD-001.md, XD-002.md, ... (SAP AEM)
```

## Methodologies

Marvin supports pluggable methodologies. Choose one during `marvin init`:

### Generic Agile (default)

Standard agile governance with features, epics, decisions, actions, questions, meetings, and reports.

### SAP Application Extension Methodology (SAP AEM)

A 3-phase methodology for building extensions on SAP BTP:

| Phase | Name | Focus | Artifacts |
|-------|------|-------|-----------|
| 1 | **Assess Extension Use Case** | Define and justify business scenarios | Use Cases (UC-xxx) |
| 2 | **Assess Extension Technology** | Evaluate BTP technologies and extension points | Tech Assessments (TA-xxx) |
| 3 | **Define Extension Target Solution** | Design the extension architecture | Extension Designs (XD-xxx) |

**How it layers with core capabilities:**

```
Layer 1 — Core:          decisions, actions, questions     (always available)
Layer 2 — Common:        meetings, reports, features, epics (shared across methodologies)
Layer 3 — Methodology:   use-cases, tech-assessments,       (sap-aem specific)
                         extension-designs, phase management
```

**Persona roles in AEM:**

| Persona | AEM Role | Owns | Phase Focus |
|---------|----------|------|-------------|
| Product Owner | Business Process Owner | Use Cases (UC-xxx) | Phase 1: define business need, classify extension type |
| Tech Lead | Solution Architect | Tech Assessments (TA-xxx), Extension Designs (XD-xxx) | Phase 2-3: evaluate BTP services, design solution |
| Delivery Manager | Project Manager | Phase gates, reports | All phases: track progression, gate readiness |

**Artifact chain with hard validation:**

```
Use Case (PO)         Tech Assessment (TL)      Extension Design (TL)
┌──────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ UC-001   │───▶│ TA-001           │───▶│ XD-001               │
│ assessed │    │ linked: UC-001   │    │ linked: TA-001       │
└──────────┘    │ recommended      │    │ architecture:        │
                └──────────────────┘    │   event-driven       │
                                        └──────────────────────┘
```

- Tech assessments require an **assessed or approved** use case
- Extension designs require a **recommended** tech assessment
- Phase advancement has **soft gates** — warnings, not blocks

**Switching methodologies:** Change `methodology` in `.marvin/config.yaml`. Existing files stay on disk. Common tools (meetings, features, epics, reports) remain available. Only methodology-specific CRUD tools are gained/lost.

## Commands

| Command | Description |
|---------|-------------|
| `marvin init` | Create a `.marvin/` project (includes methodology picker) |
| `marvin chat --as <persona>` | Start an interactive session (`po`, `dm`, `tl`) |
| `marvin status` | Show document counts and open items |
| `marvin config [key] [value]` | View or set configuration |
| `marvin ingest [file]` | Process source documents into governance artifacts |
| `marvin ingest --all` | Process all unprocessed source files |
| `marvin config api-key` | Securely set your Anthropic API key |
| `marvin sync` | Stage, commit, pull, and push governance data |
| `marvin sync init [--remote <url>]` | Initialize a git repo inside `.marvin/` |
| `marvin sync status` | Show branch, remote, and changed files |
| `marvin sync remote <url>` | Set or update the remote repository URL |
| `marvin clone <url> [dir]` | Clone governance data from a remote repo |
| `marvin chat --resume` | Resume a past session (interactive picker) |
| `marvin chat --resume <name>` | Resume a specific session by name |
| `marvin sessions` | List all saved chat sessions |
| `marvin sessions delete <name>` | Delete a saved session |
| `marvin serve` | Start standalone MCP server for Claude Desktop/Code |

## Personas

| Short Name | Full Name | Focus |
|------------|-----------|-------|
| `po` | Product Owner | Product vision, feature definition and prioritization, stakeholder needs, acceptance criteria |
| `dm` | Delivery Manager | Project delivery, epic scheduling and tracking, risk management, governance, meeting facilitation |
| `tl` | Technical Lead | Architecture, epic creation and scoping, code quality, technical decisions, implementation guidance |

Each persona has a tuned system prompt that shapes how Claude approaches your project. The agent has access to governance tools for managing features, epics, decisions, actions, questions, meetings, and reports — plus methodology-specific tools when a plugin is active.

## Feature → Epic Workflow

Marvin enforces a structured product development workflow:

1. **Product Owner** defines features (`F-xxx`) as `draft`, then approves them when requirements are clear
2. **Tech Lead** breaks approved features into implementation epics (`E-xxx`) — the system **enforces** that epics can only be created against approved features
3. **Delivery Manager** sets target dates on epics and tracks progress across features and epics

```
Feature (PO)          Epic (TL)              Work Items
┌──────────┐    ┌──────────────┐    ┌──────────────────────┐
│ F-001    │───▶│ E-001        │───▶│ A-001 (epic:E-001)   │
│ approved │    │ linked: F-001│    │ D-003 (epic:E-001)   │
└──────────┘    ├──────────────┤    └──────────────────────┘
                │ E-002        │
                │ linked: F-001│
                └──────────────┘
```

This provides **hard enforcement** (epics must link to approved features) combined with **soft guidance** (persona prompts steer each role toward their responsibilities).

## Configuration

Marvin uses two configuration layers:

- **User config** (`~/.config/marvin/config.yaml`) — API key, default model, default persona
- **Project config** (`.marvin/config.yaml`) — Project name, methodology, persona overrides

The API key resolves in order: user config > `ANTHROPIC_API_KEY` environment variable.

**Example project config (SAP AEM):**

```yaml
name: my-btp-project
methodology: sap-aem
aem:
  currentPhase: assess-use-case
personas:
  product-owner:
    enabled: true
  delivery-manager:
    enabled: true
  tech-lead:
    enabled: true
```

## Sources & Ingest

Marvin supports a **source document intake** workflow. Drop reference documents (PDFs, Markdown, text files) into `.marvin/sources/` and use the `ingest` command to extract governance artifacts.

```bash
# Check what source files are available
marvin ingest

# Process a specific file (draft mode — proposes without creating)
marvin ingest Requirements.pdf

# Process and create artifacts directly
marvin ingest Requirements.pdf --no-draft

# Process all unprocessed files
marvin ingest --all

# Use a specific persona for analysis
marvin ingest --all --as tl
```

**Draft mode** (default): Claude analyzes the document and presents a structured proposal of decisions, actions, and questions — nothing is created. Review the proposal, then use `--no-draft` or `marvin chat` to refine and create.

**Direct mode** (`--no-draft`): Claude creates artifacts directly using MCP tools. Each artifact gets a `source` frontmatter field for traceability.

The `.manifest.yaml` file in `sources/` tracks processing state — which files have been processed, which artifacts were created, and any errors.

## Git Sync

Marvin's governance data lives in `.marvin/`, which can be its own **standalone git repository** — independent from your outer project's git. This lets teams share decisions, features, epics, and other artifacts across members.

```bash
# Initialize git tracking in .marvin/
marvin sync init

# Optionally set a remote
marvin sync init --remote git@github.com:team/governance.git

# Check what's changed
marvin sync status

# Sync everything (stage → commit → pull --rebase → push)
marvin sync

# On another machine, clone the governance data
marvin clone git@github.com:team/governance.git
```

Commit messages are auto-generated based on what changed (e.g. `Update 2 decisions, 1 action, 1 feature`). If a rebase encounters conflicts, Marvin reports the conflicted files and asks you to resolve them manually before re-running `marvin sync`.

> **Tip:** Add `.marvin/` to your outer project's `.gitignore` to avoid tracking it twice.

## MCP Server Mode

Marvin can run as a standalone **MCP server** so Claude Desktop and Claude Code can use governance tools directly — without going through `marvin chat`.

```bash
# Via the serve command (from within a Marvin project)
marvin serve

# Via the standalone binary (specify project dir)
marvin-serve --project-dir /path/to/project
```

**Claude Code** — add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "marvin": {
      "command": "npx",
      "args": ["marvin", "serve"]
    }
  }
}
```

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "marvin": {
      "command": "npx",
      "args": ["marvin-serve", "--project-dir", "/path/to/project"]
    }
  }
}
```

## Session Persistence

Every chat session is **automatically saved** when you exit. Marvin uses the Claude Agent SDK's built-in session persistence and generates an AI-powered name for each session (e.g. `jwt-auth-decision`, `sprint-3-planning`).

```bash
# Start a new session — auto-saved on exit
marvin chat --as po

# → On exit: Session saved as "graphql-vs-rest-decision"

# List saved sessions
marvin sessions

# Resume via interactive picker
marvin chat --resume

# Resume a specific session by name
marvin chat --resume graphql-vs-rest-decision

# Delete a session
marvin sessions delete graphql-vs-rest-decision
```

Session metadata (name, persona, timestamps, turn count) is stored in `.marvin/sessions.yaml`. The agent also has read-only MCP access to session history — it can reference what was discussed in previous sessions for continuity.

## Architecture

```
bin/marvin.ts              → CLI entry point
bin/marvin-serve.ts        → Standalone MCP server entry point
src/cli/program.ts         → Commander command definitions
src/core/                  → Project discovery, config, errors
src/storage/               → Extensible document store (Markdown + YAML frontmatter)
src/personas/              → Persona definitions, registry, prompt builder
src/agent/                 → Claude Agent SDK integration, MCP tools
src/mcp/                   → Standalone MCP stdio server adapter
src/plugins/               → Plugin system (methodology plugins)
  ├── types.ts             → MarvinPlugin interface
  ├── common.ts            → Shared registrations + tool factory (meetings, reports, features, epics)
  ├── registry.ts          → Plugin resolution
  └── builtin/
      ├── generic-agile.ts → Default methodology
      ├── sap-aem.ts       → SAP AEM methodology
      └── tools/           → Tool implementations per artifact type
src/skills/                → Custom skill definitions
src/git/                   → Git sync (simple-git wrapper for .marvin/)
```

Key design decisions:

- **One file per artifact** — Better for Git merges and human readability than a single register file
- **System prompt composition** — Personas are behavioral modes (different system prompts), not separate agents
- **MCP tools for data access** — The agent calls tools to read/write governance data, keeping AI reasoning separate from data operations
- **Extensible storage** — `DocumentStore` accepts plugin-registered types at construction time; `DocumentType` is `string`, not a fixed union
- **Layered capabilities** — Core governance is always available, common tools are shared across methodologies, methodology-specific tools layer on top

## Development

```bash
npm run build        # Build with tsup
npm run dev          # Run via tsx (no build needed)
npm test             # Run tests with vitest
npm run test:watch   # Watch mode
npm run typecheck    # TypeScript check without emitting
```

## Tech Stack

| Component | Choice |
|-----------|--------|
| Language | TypeScript (ESM, Node 20+) |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` |
| CLI | Commander.js v14 |
| Storage | Markdown + YAML frontmatter (`gray-matter`) |
| Config | YAML (`yaml` package) |
| Git sync | `simple-git` |
| Testing | Vitest |
| Build | tsup |

## Roadmap

**Phase 2** — ~~Git sync~~, ~~MCP server mode for Claude Desktop/Code~~, ~~SAP AEM plugin~~, ~~session persistence~~

**Phase 3** — Confluence publishing, multi-provider AI, web UI

## License

MIT
