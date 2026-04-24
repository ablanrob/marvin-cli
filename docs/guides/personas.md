# Personas

Marvin provides three built-in personas, each representing a key role in software product development. Each persona has its own perspective, set of responsibilities, and access to specific document types.

## Product Owner (PO)

**ID:** `product-owner` | **Short name:** `po`

The Product Owner focuses on product vision, stakeholder needs, backlog prioritization, and value delivery.

**Core responsibilities:**

- Define and communicate product vision and strategy
- Manage and prioritize the product backlog
- Ensure stakeholder needs are understood and addressed
- Make decisions about scope, priority, and trade-offs
- Accept or reject work results based on acceptance criteria

**Document types:** decisions, questions, actions, features, use-cases, discoveries

**Contribution types:** stakeholder-feedback, acceptance-result, priority-change, market-insight

**When to use:** When you need to define what to build and why — prioritizing features, making scope decisions, capturing stakeholder requirements, conducting discovery sessions with stakeholders, or evaluating delivered work against acceptance criteria.

```bash
marvin chat --as po
```

## Delivery Manager (DM)

**ID:** `delivery-manager` | **Short name:** `dm`

The Delivery Manager focuses on project delivery, risk management, team coordination, and process governance.

**Core responsibilities:**

- Track project progress and identify blockers
- Manage risks, issues, and dependencies
- Coordinate between team members and stakeholders
- Ensure governance processes are followed (decisions logged, actions tracked)
- Facilitate meetings and ensure outcomes are captured

**Document types:** actions, decisions, meetings, questions, features, epics, tasks, sprints, discoveries

**Contribution types:** risk-finding, blocker-report, dependency-update, status-assessment

**Sprint 0 support:** The DM persona understands Sprint 0 as a variable-duration bootstrapping phase (not a regular time-boxed sprint). When a project has work items but no sprints, the DM will proactively suggest creating Sprint 0 to cover infrastructure provisioning, backlog refinement, ceremony scheduling, and integration setup.

**When to use:** When you need to manage how things get built — planning sprints, tracking progress, running meetings, managing risks, or generating status reports.

```bash
marvin chat --as dm
```

## Technical Lead (TL)

**ID:** `tech-lead` | **Short name:** `tl`

The Technical Lead focuses on technical architecture, code quality, technical decisions, and implementation guidance.

**Core responsibilities:**

- Define and maintain technical architecture
- Make and document technical decisions with clear rationale
- Review technical approaches and identify potential issues
- Guide the team on best practices and patterns
- Evaluate technical risks and propose mitigations

**Document types:** decisions, actions, questions, epics, tasks, sprints, discoveries

**Contribution types:** action-result, spike-findings, technical-assessment, architecture-review

**When to use:** When you need to decide how to build things — making architecture decisions, breaking epics into tasks, scoping technical work, or evaluating technical risk.

```bash
marvin chat --as tl
```

## Persona-specific instructions

You can customize any persona's behavior for your project by adding extra instructions in `.marvin/config.yaml`:

```yaml
personas:
  product-owner:
    extraInstructions: |
      This project follows a B2B SaaS model. Prioritize features
      based on ARR impact and customer retention metrics.
  tech-lead:
    extraInstructions: |
      We use a microservices architecture on AWS.
      All new services must use TypeScript and deploy to ECS.
```

You can also disable a persona entirely:

```yaml
personas:
  delivery-manager:
    enabled: false
```

## Skills

Personas can be extended with skills — composable capabilities that add tools, prompts, and actions. See the [Skills guide](skills.md) for details.

Assign a skill to a persona:

```bash
marvin skills install jira --as dm
```

## Contributions

The contribution system lets personas submit structured inputs that generate governance effects. For example, a Product Owner can submit stakeholder feedback that triggers creation of new features or priority changes:

```bash
marvin contribute --as po --type stakeholder-feedback \
  --about F-003 --prompt "Customer X needs SSO support by Q3"
```

## Choosing a persona

A simple rule of thumb:

| Question | Persona |
|----------|---------|
| What should we build? | Product Owner |
| How do we deliver it? | Delivery Manager |
| How do we build it? | Technical Lead |

In practice, you'll switch between personas as your focus shifts. Each persona sees the same underlying project data but interprets and acts on it through its own lens.
