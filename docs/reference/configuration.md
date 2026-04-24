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
  host: project-specific.atlassian.net    # overrides user config and env var
  email: project-team@example.com         # overrides user config and env var
  projectKey: PROJ
  statusMap:
    To Do: open
    In Progress: in-progress
    Done: done
    Blocked:
      default: blocked
      inSprint: in-progress

# AEM phase tracking (sap-aem methodology only)
aem:
  currentPhase: assess-use-case
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
| `jira.host` | string | no | Project-specific Jira host. Overrides user config and `JIRA_HOST` env var. |
| `jira.email` | string | no | Project-specific Jira email. Overrides user config and `JIRA_EMAIL` env var. |
| `jira.projectKey` | string | no | Jira project key for integration. |
| `jira.statusMap` | object | no | Mapping of Jira statuses to Marvin statuses. See below. |
| `aem.currentPhase` | string | no | Current AEM phase (`assess-use-case`, `assess-technology`, `define-solution`). Managed by the `advance_phase` tool. |

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

## Jira credential resolution

Jira credentials are resolved in priority order: **project config → user config → environment variables**. This allows per-project overrides for teams working across multiple Jira instances.

| Credential | Project config | User config | Environment variable |
|------------|---------------|-------------|---------------------|
| Host | `jira.host` | `jira.host` | `JIRA_HOST` |
| Email | `jira.email` | `jira.email` | `JIRA_EMAIL` |
| API Token | — (not supported) | `jira.apiToken` | `JIRA_API_TOKEN` |

The API token is intentionally excluded from project config to avoid committing secrets. Use the user config or environment variables for the token.

Use the `check_integrations` MCP tool to verify which credentials are configured and their source — it reports status without exposing secret values.

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (overrides user config). |
| `JIRA_HOST` | Jira Cloud instance hostname (fallback when not in user/project config). |
| `JIRA_EMAIL` | Jira account email (fallback when not in user/project config). |
| `JIRA_API_TOKEN` | Jira API token (fallback when not in user config). |
