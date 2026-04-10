# Web Dashboard

<!-- TODO: Add screenshots and detailed page descriptions -->

Marvin includes a local web dashboard for browsing project data visually.

## Launching

```bash
marvin web                  # starts on port 3000, opens browser
marvin web -p 8080          # custom port
marvin web --no-open        # don't auto-open browser
```

## Features

The dashboard provides persona-specific views:

- **Product Owner** — feature overview, backlog, priorities
- **Delivery Manager** — sprint boards, progress tracking, status reports
- **Technical Lead** — epic breakdown, task boards, technical backlog

Common views include artifact detail pages, sprint summaries, GAR reports, and an artifact relationship graph.

## Stopping

The dashboard can be stopped from a chat session using the `stop_web_dashboard` tool, or by pressing Ctrl+C in the terminal.
