# Getting Started

This guide walks you through installing Marvin, initializing your first project, and running an interactive session with a persona.

## Prerequisites

- Node.js 20 or later
- An Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))

## Installation

Install Marvin globally from npm:

```bash
npm install -g mrvn-cli
```

Or run it directly with npx:

```bash
npx mrvn-cli init
```

## Configure your API key

Marvin needs an Anthropic API key to power its AI personas. You can provide it in two ways:

**Environment variable** (recommended for CI or temporary use):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**User configuration** (persists across sessions):

```bash
marvin config apiKey sk-ant-...
```

This saves the key to `~/.config/marvin/config.yaml`.

## Initialize a project

Navigate to your project directory and run:

```bash
marvin init
```

Marvin will prompt you for a project name and methodology. Two methodologies are available out of the box:

- **Generic Agile** (default) — features, epics, sprints, tasks, and standard agile ceremonies
- **SAP Application Extension Methodology** — adds use cases, tech assessments, and extension designs for SAP BTP projects

This creates a `.marvin/` directory in your project root containing the configuration file and document store.

## Start a chat session

Launch an interactive session with one of Marvin's three personas:

```bash
marvin chat --as po    # Product Owner
marvin chat --as dm    # Delivery Manager
marvin chat --as tl    # Tech Lead
```

Each persona has access to governance tools for creating and managing project artifacts — decisions, actions, questions, features, epics, sprints, and more. The persona will guide you based on its role.

You can also send a one-off prompt without entering interactive mode:

```bash
marvin chat --as dm --prompt "What open actions do we have?"
```

## Resume a previous session

Sessions are saved automatically. To pick up where you left off:

```bash
marvin chat --resume           # interactive picker
marvin chat --resume my-session  # resume by name
```

List saved sessions with:

```bash
marvin sessions
```

## Ingest source documents

If you have existing project documents (PDFs, markdown, or text files), drop them into `.marvin/sources/` and run:

```bash
marvin ingest --all
```

Marvin will analyze each document and propose governance artifacts (decisions, actions, questions) extracted from the content. By default it runs in draft mode — review the proposals before committing them. Add `--no-draft` to create artifacts directly.

## Launch the web dashboard

For a visual overview of your project data:

```bash
marvin web
```

This starts a local server (default port 3000) and opens a dashboard in your browser showing all artifacts, sprint boards, and persona-specific views.

## Use as an MCP server

Marvin can run as an MCP server for Claude Desktop or Claude Code, giving Claude direct access to all governance tools:

```bash
marvin serve
```

See the [MCP Server guide](mcp-server.md) for configuration details.

## Next steps

- **[Personas](personas.md)** — learn what each persona does and when to use it
- **[CLI Reference](../reference/cli.md)** — full command reference
- **[Configuration](../reference/configuration.md)** — customize Marvin for your project
- **[Skills](skills.md)** — extend personas with custom capabilities
