# Configuration Reference

Marvin uses two levels of configuration: user-level (global) and project-level.

## User configuration

**Location:** `~/.config/marvin/config.yaml`

This file stores global settings that apply across all projects.

```yaml
# Anthropic API key (alternatively, set ANTHROPIC_API_KEY env var)
apiKey: sk-ant-...

# Default Claude model
defaultModel: claude-sonnet-4-5-20250929

# Default persona when --as is not specified
defaultPersona: product-owner

# Jira credentials (shared across projects)
jira:
  host: your-instance.atlassian.net
  email: you@example.com
  apiToken: your-jira-api-token
```

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | string | — | Anthropic API key. Falls back to `ANTHROPIC_API_KEY` env var. |
| `defaultModel` | string | `claude-sonnet-4-5-20250929` | Claude model to use for chat sessions. |
| `defaultPersona` | string | `product-owner` | Persona used when `--as` is not provided. |
| `jira.host` | string | — | Jira Cloud instance hostname (e.g., `acme.atlassian.net`). |
| `jira.email` | string | — | Email associated with your Jira account. |
| `jira.apiToken` | string | — | Jira API token (generate at [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)). |

Set individual values with:

```bash
marvin config apiKey sk-ant-...
marvin config defaultPersona delivery-manager
```

## Project configuration

**Location:** `.marvin/config.yaml`

Created by `marvin init`. This file defines project-specific settings.

```yaml
name: my-project

# Methodology plugin (optional)
methodology: generic-agile

# Persona overrides (optional)
personas:
  product-owner:
    enabled: true
    extraInstructions: |
      Focus on enterprise features and compliance requirements.
  tech-lead:
    extraInstructions: |
      All services use TypeScript. Database is PostgreSQL.
  delivery-manager:
    enabled: false

# Skill assignments (optional)
skills:
  product-owner: [prd-generator]
  delivery-manager: [jira, governance-review]
  tech-lead: [jira]

# Git sync remote (optional)
git:
  remote: git@github.com:org/project-governance.git

# Jira project settings (optional)
jira:
  projectKey: PROJ
  statusMap:
    To Do: open
    In Progress: in-progress
    Done: done
    Blocked:
      default: blocked
      inSprint: in-progress
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Project display name. |
| `methodology` | string | no | Plugin ID: `generic-agile` (default) or `sap-aem`. |
| `personas.<id>.enabled` | boolean | no | Enable or disable a persona. |
| `personas.<id>.extraInstructions` | string | no | Additional system prompt text for the persona. |
| `skills.<personaId>` | string[] | no | List of skill IDs assigned to a persona. |
| `git.remote` | string | no | Remote URL for governance data sync. |
| `jira.projectKey` | string | no | Jira project key for integration. |
| `jira.statusMap` | object | no | Mapping of Jira statuses to Marvin statuses. See below. |

### Jira status mapping

The `statusMap` supports two formats:

**Simple mapping** — Jira status name maps directly to a Marvin status:

```yaml
statusMap:
  To Do: open
  In Progress: in-progress
  In Review: in-progress
  Done: done
```

**Conditional mapping** — different Marvin statuses depending on context:

```yaml
statusMap:
  Blocked:
    default: blocked
    inSprint: in-progress  # treat as in-progress when item is in an active sprint
```

## Methodologies

Methodologies are plugins that define additional document types, tools, and persona guidance.

**generic-agile** (default) — Standard agile with features, epics, sprints, tasks, meetings, reports, and contributions.

**sap-aem** — Extends generic-agile with SAP-specific artifacts: use cases (UC), tech assessments (TA), and extension designs (XD). Includes phase management and SAP BTP guidance.

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (overrides user config). |
