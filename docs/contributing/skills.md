# Skill Development

Skills are composable capabilities that add tools, prompt guidance, and actions to personas. Unlike plugins (which define entire methodologies), skills are lightweight and can be mixed and matched — a Jira skill can be added to any persona in any methodology.

## SKILL.md format

The recommended way to create a skill is the SKILL.md directory format. Create a folder in `.marvin/skills/` with this structure:

```
my-skill/
├── SKILL.md              # Skill definition (required)
├── actions.yaml          # Action definitions (optional)
└── personas/             # Persona-specific prompts (optional)
    ├── product-owner.md
    ├── delivery-manager.md
    └── tech-lead.md
```

### SKILL.md file

The skill definition uses YAML frontmatter followed by a markdown body:

```markdown
---
name: my-skill
description: What this skill does in one sentence
metadata:
  version: "1.0.0"
  personas: [product-owner, delivery-manager]
---

# Default guidance

This content is injected into the system prompt for all assigned personas.
It can describe workflows, conventions, or context that the persona should know.

You can reference tools and explain when to use them.
```

The frontmatter fields:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Skill ID (used in config to reference this skill) |
| `description` | yes | Short description shown in `marvin skills` output |
| `metadata.version` | no | Semantic version |
| `metadata.personas` | no | Default persona assignments |

The markdown body becomes the default prompt fragment (applied to all personas unless overridden).

### Persona-specific prompts

If a skill should give different guidance to different personas, add markdown files in a `personas/` subdirectory. The filename must match a persona ID:

```markdown
<!-- personas/delivery-manager.md -->
When using this skill as a Delivery Manager, focus on tracking
and reporting. Use the following tools for status updates...
```

When a persona-specific file exists, it replaces the default body from SKILL.md for that persona.

### Actions

Actions are named, multi-turn conversations with a predefined system prompt. Define them in `actions.yaml`:

```yaml
- id: review_backlog
  name: "Review Backlog"
  description: "Review and prioritize the current backlog"
  systemPrompt: |
    You are reviewing the product backlog. Analyze all open features
    and actions, identify priorities, and suggest ordering based on
    business value and dependencies.
  maxTurns: 5
  allowGovernanceTools: true
```

Fields:

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `id` | yes | — | Action ID (becomes tool name: `{skillId}__{actionId}`) |
| `name` | yes | — | Display name |
| `description` | yes | — | What the action does |
| `systemPrompt` | yes | — | System prompt for the action's conversation |
| `maxTurns` | no | 5 | Maximum conversation turns |
| `allowGovernanceTools` | no | true | Whether governance tools are available |

## Creating a skill via CLI

The quickest way to scaffold a new skill:

```bash
marvin skills create my-skill
```

This creates the directory structure and a starter SKILL.md in `.marvin/skills/my-skill/`.

## Assigning skills to personas

In `.marvin/config.yaml`:

```yaml
skills:
  product-owner: [my-skill, prd-generator]
  delivery-manager: [my-skill, jira]
```

Or via CLI:

```bash
marvin skills install my-skill --as po
marvin skills install my-skill --as dm
```

List assigned skills:

```bash
marvin skills
```

## Built-in skills

**governance-review** — Reviews open governance items (decisions, actions, questions) and provides a summary. Assigned to DM and PO by default.

**jira** — Bidirectional sync between Marvin artifacts and Jira issues. Provides tools for pulling, pushing, and linking artifacts. Adds the `jira-issue` document type.

**prd-generator** — Generates Product Requirements Documents from project context. Provides tools for gathering context, generating the PRD, and exporting it.

## TypeScript skills (built-in only)

Built-in skills can be implemented in TypeScript for full programmatic control. These live in `src/skills/builtin/` and implement the `SkillDefinition` interface directly, including a `tools()` factory function. See `src/skills/builtin/` for examples.

## Migrating from YAML format

If you have skills in the older YAML format (`.marvin/skills/*.yaml`), migrate them to SKILL.md:

```bash
marvin skills migrate
```

This converts each YAML file into a SKILL.md directory with the equivalent structure.
