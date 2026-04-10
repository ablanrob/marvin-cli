# Document Types

<!-- TODO: Expand with detailed field descriptions and example documents for each type -->

Marvin stores project artifacts as markdown files with YAML frontmatter in `.marvin/docs/`. Each document type has its own directory and ID prefix.

## Document format

Every document follows this structure:

```markdown
---
id: D-001
title: Use GraphQL for API layer
type: decision
status: decided
created: 2026-02-10T14:30:00Z
updated: 2026-02-15T09:00:00Z
owner: tech-lead
tags: [architecture, api]
---

# Rationale

REST was sufficient for simple queries but GraphQL allows clients
to specify exactly the fields they need...
```

## Core types (always available)

| Type | Prefix | Directory | Statuses |
|------|--------|-----------|----------|
| decision | D | decisions/ | open, decided, superseded, dismissed |
| action | A | actions/ | open, in-progress, done |
| question | Q | questions/ | open, answered, deferred |

## Generic Agile types

| Type | Prefix | Directory | Statuses |
|------|--------|-----------|----------|
| feature | F | features/ | draft, approved, deferred, done |
| epic | E | epics/ | planned, in-progress, done |
| task | T | tasks/ | backlog, ready, in-progress, review, done |
| sprint | SP | sprints/ | planned, active, completed, cancelled |
| meeting | M | meetings/ | scheduled, completed, cancelled |
| report | R | reports/ | — |
| contribution | C | contributions/ | — |

## SAP AEM types (sap-aem methodology only)

| Type | Prefix | Directory | Statuses |
|------|--------|-----------|----------|
| use-case | UC | use-cases/ | draft, assessed, approved, deferred |
| tech-assessment | TA | tech-assessments/ | draft, evaluated, recommended, rejected |
| extension-design | XD | extension-designs/ | draft, designed, validated, approved |

## Skill-provided types

| Type | Prefix | Directory | Skill |
|------|--------|-----------|-------|
| jira-issue | JI | jira-issues/ | jira |
| prd | PRD | prds/ | prd-generator |

## Common frontmatter fields

These fields are defined on `DocumentFrontmatter` in `src/storage/types.ts`. Additional fields may be registered by plugins or skills.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Auto-generated ID (e.g., `D-001`) |
| `title` | string | yes | Document title |
| `type` | string | yes | Document type |
| `status` | string | yes | Current status |
| `created` | string | yes | ISO timestamp |
| `updated` | string | yes | ISO timestamp |
| `owner` | string | no | Owner persona or person |
| `assignee` | string | no | Assigned person |
| `priority` | string | no | Priority level |
| `tags` | string[] | no | Arbitrary tags |
| `dueDate` | string | no | ISO date |
| `source` | string | no | Source artifact ID |

Additional fields vary by type (e.g., sprints have `startDate`, `endDate`, `goal`, `linkedEpics`; features have `linkedEpics`; tasks have `linkedEpic`, `complexity`, `estimatedPoints`).
