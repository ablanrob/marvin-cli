# MCP Server

<!-- TODO: Add Claude Desktop and Claude Code configuration examples -->

Marvin can run as an MCP (Model Context Protocol) server, giving Claude direct access to all governance tools.

## Standalone server

Start the MCP server for use with Claude Desktop or Claude Code:

```bash
marvin serve
marvin serve --project-dir /path/to/project
```

This starts a stdio-based MCP server that exposes all governance tools with persona validation.

## Claude Desktop configuration

Add Marvin to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "marvin": {
      "command": "marvin-serve",
      "args": ["--project-dir", "/path/to/your/project"]
    }
  }
}
```

## Available tools

The MCP server exposes all governance tools: creating and managing decisions, actions, questions, features, epics, sprints, tasks, and more. It also provides persona management tools (`set_persona`, `get_persona_guidance`) that let Claude switch between personas within a session.

See the [CLI Reference](../reference/cli.md) for the full list of operations available through MCP tools.
