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
