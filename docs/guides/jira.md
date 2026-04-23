# Jira Integration

<!-- TODO: Expand with detailed setup walkthrough and sync examples -->

Marvin integrates with Jira Cloud for bidirectional sync between governance artifacts and Jira issues.

## Setup

1. Add Jira credentials to your user config (`~/.config/marvin/config.yaml`):

```yaml
jira:
  host: your-instance.atlassian.net
  email: you@example.com
  apiToken: your-api-token
```

2. Set the Jira project key in your project config (`.marvin/config.yaml`):

```yaml
jira:
  projectKey: PROJ
  statusMap:
    To Do: open
    In Progress: in-progress
    Done: done
```

Alternatively, set credentials via environment variables: `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`.

### Project-scoped credentials

If you work with multiple Jira instances, you can override the host and email per project in `.marvin/config.yaml`:

```yaml
jira:
  host: project-specific.atlassian.net
  email: project-team@example.com
  projectKey: PROJ
```

The resolution order is: **project config → user config → environment variables**. The API token is never stored in project config — use the user config or environment variables.

### Checking configuration

Use the `check_integrations` MCP tool to verify your Jira setup without exposing secrets:

```
> check_integrations
{
  "jira": {
    "configured": true,
    "host": "your-instance.atlassian.net",
    "hostSource": "user",
    "emailConfigured": true,
    "apiTokenConfigured": true,
    "projectKey": "PROJ"
  }
}
```

3. Assign the Jira skill to the relevant personas:

```bash
marvin skills install jira --as dm
marvin skills install jira --as tl
```

## CLI commands

```bash
marvin jira sync [artifactId]           # sync linked artifacts
marvin jira sync --dry-run              # preview changes
marvin jira statuses [projectKey]       # show status mappings
marvin jira daily                       # daily change summary
marvin jira daily --from 2026-04-01 --to 2026-04-07
```

## Status mapping

See [Configuration Reference](../reference/configuration.md#jira-status-mapping) for status map syntax.
