# Skills

<!-- TODO: Expand with detailed examples and walkthroughs -->

Skills are composable capabilities that extend what personas can do. They add tools, prompt guidance, and predefined actions without changing the underlying methodology.

## Built-in skills

**governance-review** — Reviews open decisions, actions, and questions. Available for DM and PO.

**jira** — Bidirectional sync between Marvin artifacts and Jira issues. Pull, push, link, and sync artifacts.

**prd-generator** — Generate Product Requirements Documents from project context.

## Managing skills

```bash
marvin skills                           # list all skills
marvin skills install jira --as dm      # assign to persona
marvin skills remove jira --as dm       # unassign
marvin skills create my-skill           # scaffold a new skill
```

## Creating custom skills

See [Skill Development](../contributing/skills.md) for the full guide on creating skills with the SKILL.md format.
