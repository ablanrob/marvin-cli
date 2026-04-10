#!/usr/bin/env bash
# check-docs.sh — Warn when source changes may require documentation updates.
# Called from .husky/pre-commit. Prints a reminder but never blocks the commit.

set -euo pipefail

# Map source paths to the doc pages most likely to need updating.
# Format: "source_pattern|doc_file|short_reason"
MAPPINGS=(
  "src/cli/|docs/reference/cli.md|CLI commands changed"
  "src/core/config.ts|docs/reference/configuration.md|Configuration schema changed"
  "src/core/project.ts|docs/guides/getting-started.md|Project init/discovery changed"
  "src/personas/|docs/guides/personas.md|Persona definitions changed"
  "src/plugins/types.ts|docs/contributing/plugins.md|Plugin interface changed"
  "src/plugins/registry.ts|docs/contributing/plugins.md|Plugin registry changed"
  "src/plugins/builtin/|docs/reference/document-types.md|Plugin document types changed"
  "src/skills/types.ts|docs/contributing/skills.md|Skill interface changed"
  "src/skills/registry.ts|docs/contributing/skills.md|Skill registry changed"
  "src/storage/types.ts|docs/reference/document-types.md|Document types changed"
  "src/storage/store.ts|docs/contributing/architecture.md|Storage layer changed"
  "src/agent/mcp-server.ts|docs/guides/mcp-server.md|MCP server changed"
  "src/mcp/|docs/guides/mcp-server.md|MCP layer changed"
  "src/web/|docs/guides/web-dashboard.md|Web dashboard changed"
  "src/index.ts|docs/contributing/architecture.md|Public API exports changed"
)

# Collect staged files (excludes deletions)
STAGED=$(git diff --cached --name-only --diff-filter=d 2>/dev/null || true)

if [ -z "$STAGED" ]; then
  exit 0
fi

# Check if any src/ files are staged
HAS_SRC_CHANGES=false
for file in $STAGED; do
  if [[ "$file" == src/* ]] || [[ "$file" == bin/* ]]; then
    HAS_SRC_CHANGES=true
    break
  fi
done

if [ "$HAS_SRC_CHANGES" = false ]; then
  exit 0
fi

# Check if any docs/ files are also staged
HAS_DOC_CHANGES=false
for file in $STAGED; do
  if [[ "$file" == docs/* ]] || [[ "$file" == README.md ]] || [[ "$file" == CLAUDE.md ]]; then
    HAS_DOC_CHANGES=true
    break
  fi
done

# If docs are already being updated, no need to warn
if [ "$HAS_DOC_CHANGES" = true ]; then
  exit 0
fi

# Find which doc pages might need attention
SUGGESTIONS=()
for mapping in "${MAPPINGS[@]}"; do
  IFS='|' read -r pattern doc_file reason <<< "$mapping"
  for file in $STAGED; do
    if [[ "$file" == ${pattern}* ]]; then
      # Avoid duplicate suggestions for the same doc
      already_listed=false
      for s in "${SUGGESTIONS[@]+"${SUGGESTIONS[@]}"}"; do
        if [[ "$s" == *"$doc_file"* ]]; then
          already_listed=true
          break
        fi
      done
      if [ "$already_listed" = false ]; then
        SUGGESTIONS+=("  → $doc_file ($reason)")
      fi
      break
    fi
  done
done

if [ ${#SUGGESTIONS[@]} -eq 0 ]; then
  # src/ changed but no specific mapping matched — give a generic reminder
  echo ""
  echo "📝 Docs reminder: source files changed — consider whether docs/ needs updating."
  echo ""
else
  echo ""
  echo "📝 Docs reminder: the following pages may need updating:"
  for suggestion in "${SUGGESTIONS[@]}"; do
    echo "$suggestion"
  done
  echo ""
  echo "   This is just a reminder — the commit will proceed."
  echo ""
fi

exit 0
