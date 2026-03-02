# Marvin CLI

AI-powered product development assistant. Marvin provides three expert personas — **Product Owner**, **Delivery Manager**, and **Technical Lead** — that help teams manage features, epics, sprints, decisions, actions, questions, meetings, and reports through an interactive CLI backed by Claude.

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

Marvin stores all project governance data as **Markdown files with YAML frontmatter** inside a `.marvin/` directory. Each artifact gets its own file with an auto-incrementing ID (`F-001`, `E-001`, `SP-001`, `D-001`, `A-002`, `Q-003`). This makes everything human-readable, Git-friendly, and Obsidian-compatible.

When you start a chat session, Marvin:

1. Loads a persona-specific system prompt (Product Owner focuses on value and stakeholders; Delivery Manager on risks and status; Tech Lead on architecture and quality)
2. Exposes your project's governance data as **MCP tools** that Claude can call
3. Starts an interactive conversation where the agent can read, create, and update project artifacts

```
.marvin/
├── config.yaml                # Project configuration
├── sessions.yaml              # Saved chat sessions
├── templates/                 # Document templates
├── skills/                    # Custom skills (SKILL.md format)
├── sources/                   # Source documents for ingestion
│   ├── .manifest.yaml         # Tracks processing state
│   ├── Requirements.pdf       # Source document
│   └── Architecture Notes.md  # Source document
└── docs/
    ├── features/              # F-001.md, F-002.md, ...
    ├── epics/                 # E-001.md, E-002.md, ...
    ├── sprints/               # SP-001.md, SP-002.md, ...
    ├── decisions/             # D-001.md, D-002.md, ...
    ├── actions/               # A-001.md, A-002.md, ...
    ├── questions/             # Q-001.md, Q-002.md, ...
    ├── meetings/              # 2026-02-08-kickoff.md, ...
    ├── reports/               # R-001.md, R-002.md, ...
    ├── contributions/         # C-001.md, C-002.md, ...
    ├── jira-issues/           # JI-001.md, JI-002.md, ... (Jira skill)
    ├── use-cases/             # UC-001.md, UC-002.md, ... (SAP AEM)
    ├── tech-assessments/      # TA-001.md, TA-002.md, ... (SAP AEM)
    └── extension-designs/     # XD-001.md, XD-002.md, ... (SAP AEM)
```

## Commands

| Command | Description |
|---------|-------------|
| `marvin init` | Create a `.marvin/` project (includes methodology picker) |
| `marvin chat --as <persona>` | Start an interactive session (`po`, `dm`, `tl`) |
| `marvin chat -p "<text>" --as <persona>` | Single-prompt (non-interactive) session |
| `marvin chat --resume` | Resume a past session (interactive picker) |
| `marvin chat --resume <name>` | Resume a specific session by name |
| `marvin status` | Show document counts and open items |
| `marvin config [key] [value]` | View or set configuration |
| `marvin config api-key` | Securely set your Anthropic API key |
| `marvin import <path>` | Import documents or sources from external paths |
| `marvin import <path> --dry-run` | Preview import plan without writing files |
| `marvin ingest [file]` | Process source documents into governance artifacts |
| `marvin ingest --all` | Process all unprocessed source files |
| `marvin analyze <meeting-id>` | Analyze a meeting to extract decisions, actions, questions |
| `marvin contribute` | Submit a structured contribution from a persona |
| `marvin report gar` | Generate a Green/Amber/Red status report (ASCII) |
| `marvin report gar --format confluence` | GAR report as Confluence-friendly markdown |
| `marvin report health` | Generate a governance health check report (ASCII) |
| `marvin report health --format confluence` | Health report as Confluence-friendly markdown |
| `marvin web` | Launch a local web dashboard for project data |
| `marvin web -p 8080` | Web dashboard on a custom port |
| `marvin serve` | Start standalone MCP server for Claude Desktop/Code |
| `marvin sync` | Stage, commit, pull, and push governance data |
| `marvin sync init [--remote <url>]` | Initialize a git repo inside `.marvin/` |
| `marvin sync status` | Show branch, remote, and changed files |
| `marvin sync remote <url>` | Set or update the remote repository URL |
| `marvin clone <url> [dir]` | Clone governance data from a remote repo |
| `marvin sessions` | List all saved chat sessions |
| `marvin sessions delete <name>` | Delete a saved session |
| `marvin skills` | List available skills and persona assignments |
| `marvin skills install <skill> --as <persona\|all>` | Enable a skill for a persona (or all) |
| `marvin skills remove <skill> --as <persona\|all>` | Disable a skill for a persona (or all) |
| `marvin skills create <name>` | Scaffold a new custom skill |
| `marvin skills migrate` | Migrate old YAML skills to SKILL.md format |

## Personas

| Short Name | Full Name | Focus |
|------------|-----------|-------|
| `po` | Product Owner | Product vision, feature definition and prioritization, stakeholder needs, acceptance criteria |
| `dm` | Delivery Manager | Project delivery, sprint planning and tracking, epic scheduling, risk management, governance, meeting facilitation |
| `tl` | Technical Lead | Architecture, epic creation and scoping, sprint scoping and technical execution, code quality, technical decisions, implementation guidance |

Each persona has a tuned system prompt that shapes how Claude approaches your project. The agent has access to governance tools for managing features, epics, sprints, decisions, actions, questions, meetings, and reports — plus methodology-specific tools when a plugin is active.

## Feature → Epic → Sprint Workflow

Marvin enforces a structured product development workflow:

1. **Product Owner** defines features (`F-xxx`) as `draft`, then approves them when requirements are clear
2. **Tech Lead** breaks approved features into implementation epics (`E-xxx`) — the system **enforces** that epics can only be created against approved features. An epic can link to **one or more features** (e.g. a cross-cutting epic spanning auth and profiles)
3. **Delivery Manager** creates sprints (`SP-xxx`) with goals and date boundaries, assigns epics to sprints, and tracks progress

```
Feature (PO)          Epic (TL)                       Sprint (DM)
┌──────────┐    ┌────────────────────────┐    ┌──────────────────────┐
│ F-001    │───▶│ E-001                  │───▶│ SP-001               │
│ approved │    │ linked: [F-001]        │    │ linkedEpics: [E-001]  │
└──────────┘    ├────────────────────────┤    │ goal: "Deliver auth"  │
                │ E-002                  │    │ 2026-03-01..03-14     │
┌──────────┐───▶│ linked: [F-001, F-002] │    └──────────────────────┘
│ F-002    │    └────────────────────────┘             │
│ approved │                                  ┌────────┴─────────────┐
└──────────┘                                  │ A-001 (sprint:SP-001) │
                                              │ D-003 (sprint:SP-001) │
                                              └──────────────────────┘
```

Epics store `linkedFeature` as an array (e.g. `["F-001", "F-002"]`). Legacy files with a single string value are normalized to an array on read for backwards compatibility. Multi-linked epics appear in progress reports under each linked feature, and feature tags (`feature:F-xxx`) are generated for all linked features.

**Sprints** are time-boxed iterations with:
- `goal` — what the sprint aims to deliver
- `startDate` / `endDate` — sprint boundaries (ISO dates)
- `status` — `planned` → `active` → `completed` (or `cancelled`)
- `linkedEpics` — soft-validated references to epic IDs (warns if not found but doesn't block creation)

When a sprint links to epics, those epics are auto-tagged with `sprint:SP-xxx`. Work items (actions, decisions, questions) are associated with sprints via the same `sprint:SP-xxx` tag convention.

### Action Scheduling

Actions support a `dueDate` field (ISO date) and a `sprints` parameter for sprint assignment:

- **`create_action`** and **`update_action`** accept `dueDate` (e.g. `'2026-03-15'`) and `sprints` (e.g. `['SP-001']`)
- The `sprints` parameter translates to `sprint:SP-xxx` tags automatically
- When an action has a `dueDate` but no sprint assigned, the tool suggests matching sprints whose date range contains the due date
- **`suggest_sprints_for_action`** is a standalone read-only tool that returns matching sprints for any due date
- Open actions with a `dueDate` in the past are **automatically flagged as overdue** in GAR reports (merged with tag-based `overdue` items, deduplicated)

### Sprint Planning

Sprint planning is supported by the `gather_sprint_planning_context` tool, which aggregates all planning-relevant data in a single call:

| Section | Contents |
|---------|----------|
| `approvedFeatures` | Approved features sorted by priority, with epic counts by status |
| `backlog` | Unassigned non-done epics, sorted by parent feature priority, enriched with feature context and effort estimates |
| `activeSprint` | Current active sprint with linked epic statuses, work item counts, and completion % |
| `velocityReference` | Last 2 completed sprints with epic count, effort strings, and work item throughput |
| `blockers` | Open questions, open risk-finding and blocker-report contributions |
| `summary` | Total backlog size, approved features with no epics, epics at risk, planned sprint count |

When asked to propose a sprint, the DM reasons through priority, capacity, dependencies, and risk to present a structured proposal. The TL focuses on technical readiness, effort balance, and feature coverage. Both personas call this tool automatically before proposing a sprint plan.

This provides **hard enforcement** (epics must link to approved features) combined with **soft guidance** (persona prompts steer each role toward their responsibilities) and **sprint-level tracking** for time-boxed delivery.

## Web Dashboard

Marvin includes a local web dashboard for visualizing project data.

```bash
marvin web                  # Start on port 3000, auto-open browser
marvin web -p 8080          # Custom port
marvin web --no-open        # Don't auto-open the browser
```

**Pages:**

| Page | URL | Description |
|------|-----|-------------|
| Overview | `/` | Document type counts and recent activity |
| GAR Report | `/gar` | Visual Green/Amber/Red status across scope, schedule, quality, resources |
| Health Check | `/health` | Governance health check covering artifact completeness and process metrics |
| Status Board | `/board` | Kanban-style board with documents grouped by status, filterable by type |
| Document List | `/docs/:type` | Filterable list by status and owner |
| Document Detail | `/docs/:type/:id` | Full document view with rendered markdown |

The sidebar groups navigation into Governance (decisions, actions, questions), Project (features, epics, sprints), and plugin/skill-specific sections.

**Agent access:** During chat sessions, the agent can start the dashboard and query dashboard data via MCP tools (`start_web_dashboard`, `stop_web_dashboard`, `get_dashboard_overview`, `get_dashboard_gar`, `get_dashboard_board`).

## Contributions

Contributions (C-xxx) are structured inputs from personas outside of meetings. Each persona has specific contribution types that generate governance effects when analyzed.

```bash
# Draft mode (default) — proposes effects without executing
marvin contribute --as tl --type action-result --prompt "Unit tests completed for auth module"

# Direct mode — creates/updates artifacts with source:C-xxx traceability
marvin contribute --as po --type stakeholder-feedback --prompt "CFO wants cost reporting" --no-draft

# Link to a related artifact
marvin contribute --as dm --type risk-finding --prompt "Third-party API rate limit risk" --about A-001
```

**Contribution types by persona:**

| Persona | Types |
|---------|-------|
| Product Owner | `stakeholder-feedback`, `acceptance-result`, `priority-change`, `market-insight` |
| Tech Lead | `action-result`, `spike-findings`, `technical-assessment`, `architecture-review` |
| Delivery Manager | `risk-finding`, `blocker-report`, `dependency-update`, `status-assessment` |

During chat sessions, the agent has access to `list_contributions`, `get_contribution`, `create_contribution`, and `update_contribution` tools.

## GAR Reports

The Green/Amber/Red report evaluates project health across four dimensions:

| Dimension | What it measures |
|-----------|-----------------|
| **Scope** | Completion percentage (done vs total actions) |
| **Schedule** | Blocked items + overdue items (tag-based and date-based, deduplicated) |
| **Quality** | Risk-tagged items + open questions |
| **Resources** | Unowned open actions |

Each dimension gets a Green/Amber/Red rating based on thresholds. The combined project status uses the worst individual rating.

```bash
marvin report gar                      # ASCII terminal output with color
marvin report gar --format confluence  # Confluence-ready markdown
```

During chat sessions, the agent can generate GAR reports via the `generate_gar_report` tool and persist them with `save_report`.

## Health Check

The health check report provides a comprehensive view of **artifact data quality** and **governance process health** across two sections.

### Completeness

Checks open/active items for required fields:

| Type | Open statuses | Required fields |
|------|---------------|-----------------|
| Action | `open`, `in-progress` | owner, priority, dueDate, content |
| Decision | `open`, `proposed` | owner, content |
| Question | `open` | owner, content |
| Feature | `draft`, `approved` | owner, priority, content |
| Epic | `planned`, `in-progress` | owner, targetDate, estimatedEffort, content |
| Sprint | `planned`, `active` | goal, startDate, endDate, at least 1 linkedEpic |

Each category gets a completion percentage: 100% = green, 75%+ = amber, <75% = red.

### Process

Measures governance workflow health using timestamps:

| Metric | What it measures | Green | Amber | Red |
|--------|-----------------|-------|-------|-----|
| Stale items | Open items not updated in 14+ days | 0 | 1-3 | 4+ |
| Aging actions | Open actions older than 30 days | 0 | 1-3 | 4+ |
| Decision velocity | Avg days to resolve decisions | ≤7d | ≤21d | >21d |
| Question resolution | Avg days to answer questions | ≤7d | ≤14d | >14d |

The overall status uses the worst rating across all completeness and process categories.

```bash
marvin report health                      # ASCII terminal output with color
marvin report health --format confluence  # Confluence-ready markdown
```

During chat sessions, the agent can generate health reports via the `generate_health_report` tool.

## Methodologies

Marvin supports pluggable methodologies. Choose one during `marvin init`:

### Generic Agile (default)

Standard agile governance with features, epics, sprints, decisions, actions, questions, meetings, and reports.

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
Layer 2 — Common:        meetings, reports, features, epics, (shared across methodologies)
                         sprints, contributions
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

## Skills

Skills are composable capabilities that work with any methodology. Unlike plugins (which define a methodology), skills add tools and behaviors that any persona can use.

### Managing skills

```bash
marvin skills                           # List available skills and assignments
marvin skills install jira --as all     # Enable for all personas
marvin skills install jira --as po      # Enable for one persona
marvin skills remove jira --as all      # Disable for all personas
marvin skills remove jira --as po       # Disable for one persona
```

### Creating custom skills

```bash
marvin skills create my-custom-skill
```

This scaffolds a new skill in `.marvin/skills/my-custom-skill/`:

```
.marvin/skills/my-custom-skill/
├── SKILL.md          # Skill definition (YAML frontmatter + prompt body)
├── actions.yaml      # Action definitions
└── personas/         # Persona-specific prompts (optional)
    ├── product-owner.md
    ├── tech-lead.md
    └── delivery-manager.md
```

If you have skills in the older YAML format, migrate them:

```bash
marvin skills migrate    # Converts .yaml files to SKILL.md directories
```

### Governance Review

Built-in skill that enables DM and PO personas to review all open governance items and produce structured summaries with recommendations. Reviews open decisions, actions, and questions for age, ownership, priority, and blockers.

### Jira Integration

Bidirectional sync between Marvin artifacts and Jira issues. Imported issues are stored locally as `JI-xxx` documents in `.marvin/docs/jira-issues/`.

**Enabling the skill** — Jira is opt-in. Add it to the `skills` section of `.marvin/config.yaml` for the personas that need it:

```yaml
skills:
  product-owner: [jira]
  tech-lead: [jira]
  delivery-manager: [jira]
```

**Authentication** — set three environment variables (no secrets in config files):

```bash
export JIRA_HOST=yourcompany.atlassian.net
export JIRA_EMAIL=you@company.com
export JIRA_API_TOKEN=your-api-token    # Generate at https://id.atlassian.com/manage-profile/security/api-tokens
```

**Tools available to all personas:**

| Tool | Direction | Description |
|------|-----------|-------------|
| `list_jira_issues` | local read | List locally synced JI-xxx documents, filter by status or Jira key |
| `get_jira_issue` | local read | Get a JI-xxx by local ID or Jira key |
| `pull_jira_issue` | Jira → local | Fetch one issue by key, create/update local JI-xxx |
| `pull_jira_issues_jql` | Jira → local | Bulk fetch via JQL query, create/update local JI-xxx |
| `push_artifact_to_jira` | local → Jira | Create a Jira issue from any Marvin artifact (D/A/Q/F/E) |
| `sync_jira_issue` | bidirectional | Push local changes to Jira, pull latest status/assignee/labels back |
| `link_artifact_to_jira` | local only | Link a Marvin artifact to an existing JI-xxx |

**How each persona uses it:**

- **Product Owner** — Pull stakeholder-reported issues for triage, push approved features as Stories, link decisions to Jira issues for audit trail
- **Tech Lead** — Pull technical issues for sprint planning, push epics for cross-team visibility, bidirectional sync to keep governance aligned
- **Delivery Manager** — Pull sprint issues for progress tracking, push actions for stakeholder visibility, use JQL queries for reporting

Tools gracefully handle missing Jira credentials — local read tools (`list_jira_issues`, `get_jira_issue`, `link_artifact_to_jira`) always work, while API-calling tools return a helpful error message asking you to set the environment variables.

## Meeting Analysis

Analyze completed meetings to extract governance artifacts:

```bash
marvin analyze M-001                  # Draft mode — proposes without creating
marvin analyze M-001 --no-draft       # Create artifacts directly
marvin analyze M-001 --as tl          # Use tech-lead persona (default: dm)
```

The `analyze_meeting` MCP tool is also available during chat sessions for the same workflow.

## Import

`marvin import` brings external data into your project. It auto-detects what you're pointing at and does the right thing:

| Input | What happens |
|-------|-------------|
| Another `.marvin/` project (or dir with `config.yaml`) | Imports all governance documents from its `docs/` subdirectories |
| Directory with `decisions/`, `actions/`, etc. | Imports markdown documents directly |
| A `.md` file with valid Marvin frontmatter (`id` + `type`) | Imports as a single governance artifact |
| Directory with PDFs, text files, or unstructured markdown | Copies to `.marvin/sources/` |
| A single PDF or TXT file | Copies to `.marvin/sources/` |

### Basic usage

```bash
# Preview what will happen (no files written)
marvin import ./proto-governance --dry-run

# Import governance documents from another directory
marvin import ./proto-governance

# Import a single Marvin-format document
marvin import ./exported/D-001.md

# Import from another Marvin project
marvin import ../other-project/.marvin

# Import raw source files (PDFs, text) into sources/
marvin import ./reference-docs
```

### Handling ID conflicts

When an imported document has the same ID as an existing one, the `--conflict` option controls behavior:

```bash
# Renumber conflicting IDs (default) — D-001 becomes D-004, etc.
marvin import ./docs --conflict renumber

# Skip documents that conflict
marvin import ./docs --conflict skip

# Overwrite existing documents
marvin import ./docs --conflict overwrite
```

When renumbering, cross-references within document content are updated automatically (e.g. "See D-001" becomes "See D-004").

### Tagging imports

Add a tag to all imported documents for traceability:

```bash
marvin import ./proto-governance --tag imported:proto
```

### Importing and ingesting in one step

When importing raw source files (PDFs, text), use `--ingest` to immediately process them with AI analysis:

```bash
# Copy files to sources/ and then run ingest on each
marvin import ./reference-docs --ingest

# Use a specific persona and create artifacts directly
marvin import ./reference-docs --ingest --as tl --no-draft
```

### Options reference

| Option | Description | Default |
|--------|-------------|---------|
| `--dry-run` | Preview the import plan without writing files | off |
| `--conflict <strategy>` | How to handle ID conflicts: `renumber`, `skip`, `overwrite` | `renumber` |
| `--tag <tag>` | Tag added to all imported documents | none |
| `--ingest` / `--no-ingest` | Trigger AI ingest after copying raw sources | off |
| `--as <persona>` | Persona for ingest (`po`, `dm`, `tl`) | `product-owner` |
| `--draft` / `--no-draft` | Draft mode for ingest (propose vs. create) | `--draft` |

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

The `.manifest.yaml` file in `sources/` tracks processing state — which files have been processed, which artifacts were created, and any errors. During chat sessions, the agent can query source status via `list_sources` and `get_source_info` tools.

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

Session metadata (name, persona, timestamps, turn count) is stored in `.marvin/sessions.yaml`. The agent also has read-only MCP access to session history (`list_sessions`, `get_session`) — it can reference what was discussed in previous sessions for continuity.

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

## Architecture

```
bin/marvin.ts              → CLI entry point
bin/marvin-serve.ts        → Standalone MCP server entry point
src/cli/program.ts         → Commander command definitions
src/core/                  → Project discovery, config, errors
src/storage/               → Extensible document store (Markdown + YAML frontmatter)
src/personas/              → Persona definitions, registry, prompt builder
src/agent/                 → Claude Agent SDK integration, MCP tools
  └── tools/               → Session, source, web dashboard, and document tools
src/mcp/                   → Standalone MCP stdio server adapter
src/web/                   → Web dashboard (server, router, templates)
src/plugins/               → Plugin system (methodology plugins)
  ├── types.ts             → MarvinPlugin interface
  ├── common.ts            → Shared registrations + tool factory
  ├── registry.ts          → Plugin resolution
  └── builtin/
      ├── generic-agile.ts → Default methodology
      ├── sap-aem.ts       → SAP AEM methodology
      └── tools/           → Tool implementations per artifact type
src/reports/               → Report generators (GAR, Health: collector, evaluator, renderers)
src/contributions/         → Contribution workflow (types, prompts, analysis)
src/import/                → Import engine (classifier, resolver, plan/execute)
src/skills/                → Skill system (composable capabilities)
  ├── types.ts             → SkillDefinition interface
  ├── registry.ts          → Skill loading, resolution, tool/prompt collection
  └── builtin/
      ├── governance-review.ts → Governance review skill
      └── jira/            → Jira integration skill (client, tools, definition)
src/git/                   → Git sync (simple-git wrapper for .marvin/)
```

Key design decisions:

- **One file per artifact** — Better for Git merges and human readability than a single register file
- **System prompt composition** — Personas are behavioral modes (different system prompts), not separate agents
- **MCP tools for data access** — The agent calls tools to read/write governance data, keeping AI reasoning separate from data operations
- **Extensible storage** — `DocumentStore` accepts plugin- and skill-registered types at construction time; `DocumentType` is `string`, not a fixed union
- **Layered capabilities** — Core governance is always available, common tools are shared across methodologies, methodology-specific tools layer on top, and skills (like Jira) compose with any methodology

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

## License

MIT
