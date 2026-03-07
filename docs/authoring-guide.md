---
layout: default
title: Capability Authoring Guide
description: How to create, structure, and publish ACR capabilities.
---

# ACR Capability Authoring Guide

How to create, structure, and publish ACR capabilities.

## Quick Start

```bash
# Option 1: Migrate an existing SKILL.md
acr migrate ./skills/my-skill/SKILL.md --output-dir ./my-capability

# Option 2: Create from scratch
mkdir my-capability && cd my-capability
touch capability.yaml index.txt summary.md standard.md
```

## File Structure

Every capability is a directory with these files:

```
my-capability/
├── capability.yaml    # Manifest (required)
├── index.txt          # One-line awareness (required)
├── summary.md         # Condensed reference (recommended)
├── standard.md        # Full working reference (required)
└── deep.md            # Extended reference (optional)
```

### Level of Detail (LOD) — The Core Concept

ACR loads capabilities at different resolution levels depending on context window pressure:

| Level | Purpose | Typical Size | When Used |
|-------|---------|-------------|-----------|
| `index` | "I exist" awareness | 10-30 tokens | Cold start, all capabilities registered |
| `summary` | "Here's what I do" | 50-300 tokens | Possibly relevant, low priority |
| `standard` | "Here's how to use me" | 200-3000 tokens | Actively needed |
| `deep` | "Here's everything" | 1000-10000 tokens | Primary focus of the task |

**Key rule:** Each level INCLUDES all content from lower levels. `standard.md` should contain everything from `summary.md` plus more detail.

### index.txt

One line. Name and core purpose. This is what the agent sees when the capability is "cold" (registered but not active).

```
linear: Project management with Linear. Create/update issues, manage sprints, search tickets.
```

Keep it under 30 tokens. This file is loaded for ALL registered capabilities, so every token counts.

### summary.md

A condensed reference — enough for the agent to know if it needs the full version. Include:
- What the capability does
- Key commands or patterns
- When to escalate to `standard`

```markdown
# Linear — Summary

Project management via Linear API.

**Key actions:** create issue, update status, search, list projects
**CLI:** `linear issue create`, `linear issue list`, `linear search`
**Escalate to standard when:** creating complex queries, managing workflows, or bulk operations
```

Target: 50-300 tokens.

### standard.md

The working reference. Everything the agent needs to use the capability effectively:
- Complete command reference
- Common patterns and examples
- Error handling
- Integration notes

This is what gets loaded when the capability is "active."

Target: 200-3000 tokens (keep it focused — every token costs budget).

### deep.md (optional)

Extended reference for when the capability is the primary focus. Include:
- Full API documentation
- Advanced patterns
- Edge cases
- Troubleshooting guides

Only create this if the capability has substantial additional content beyond `standard.md`.

## capability.yaml — The Manifest

```yaml
name: my-capability
type: capability          # or 'capability-set'
version: 1.0.0
description: "What this capability does in one sentence"

# What this capability provides (for dependency resolution)
provides:
  - my-capability
  - related-tag

# What this capability requires
requires:
  tools:
    - tool-name            # MCP tools needed
  capabilities:
    - name: other-cap      # Other capabilities needed
      resolution: summary  # Minimum resolution required
  context:
    - type: file
      path: ./config.json

# Token budgets (MUST match actual file sizes)
budget:
  index: 15                # tokens for index.txt
  summary: 150             # tokens for summary.md
  standard: 800            # tokens for standard.md
  deep: 3000               # tokens for deep.md (if exists)

# When to auto-activate
activation:
  triggers:
    - type: pattern
      condition: "(?i)\\b(linear|ticket|issue|sprint)\\b"
    - type: semantic
      condition: "project management and issue tracking"
  co_activates:
    - related-capability

# Priority for eviction decisions (critical > high > medium > low)
priority: medium

# State that persists across mount/unmount cycles
state_schema:
  version: 1
  max_size_tokens: 200
  fields:
    - name: currentProject
      type: string
      description: "Active project context"
    - name: recentTickets
      type: array
      description: "Recently accessed ticket IDs"
```

## Activation Triggers

Triggers determine when a capability auto-mounts in response to user messages.

### Pattern Triggers
Regex patterns matched against user input. Fast and deterministic.

```yaml
activation:
  triggers:
    - type: pattern
      condition: "(?i)\\b(nestjs|nest\\.js|nest controller|nest service)\\b"
```

Tips:
- Use `(?i)` for case-insensitive
- Use `\\b` for word boundaries
- Include common variations
- Test with: `echo "your text" | grep -iP 'your pattern'`

### Semantic Triggers
Natural language descriptions matched via TF-IDF cosine similarity.

```yaml
activation:
  triggers:
    - type: semantic
      condition: "database schema design and ORM configuration"
```

Tips:
- Describe the *intent*, not the tool name
- Use specific domain language
- Complements pattern triggers for fuzzy matching

### Co-activation
When this capability mounts, also mount these (at summary by default):

```yaml
activation:
  co_activates:
    - prisma-gen      # NestJS often needs Prisma
    - github          # For PR workflows
```

## State Schema

Capabilities can persist state across mount/unmount cycles. When a capability is evicted for budget, its state is serialized. When re-mounted, state is restored.

```yaml
state_schema:
  version: 1              # Increment on breaking changes (old state discarded)
  max_size_tokens: 200    # Budget for serialized state
  fields:
    - name: currentProject
      type: string
      description: "The project the user is currently working on"
    - name: searchHistory
      type: array
      description: "Recent search queries for context"
```

**Important:** State is discarded on version mismatch. If you change the schema shape, bump the version.

## Budget Accuracy

The `budget` field MUST match actual file token counts. Use `acr lint` to verify:

```bash
acr lint ./my-capability

# Common output:
# ⚠️ BUDGET_DRIFT_STANDARD: declared 500 tokens, actual 800 (60% off)
```

To get accurate counts:
```bash
acr budget ./my-capability
```

## Capability Sets

Bundle related capabilities into a set:

```yaml
name: engineering.backend
type: capability-set
version: 1.0.0
description: "Backend engineering capability set"

capabilities:
  - name: nestjs
    resolution: standard
  - name: prisma-gen
    resolution: standard
  - name: github
    resolution: summary
  - name: linear
    resolution: summary
```

Use capability sets for role-based loading:
- `engineering.backend` — NestJS + Prisma + GitHub
- `engineering.frontend` — Next.js + React + Tailwind
- `operations.devops` — CI/CD + Docker + monitoring

## Validation Checklist

Before publishing:

1. `acr validate ./my-capability` — schema validation passes ✅
2. `acr lint ./my-capability` — no errors or warnings ✅
3. `acr budget ./my-capability` — budgets are accurate ✅
4. Each LOD level includes content from lower levels ✅
5. Triggers cover common invocation patterns ✅
6. Description is specific enough for semantic matching ✅

## Migration from SKILL.md

```bash
acr migrate ./skills/my-skill/SKILL.md --output-dir ./my-capability

# The migrator will:
# 1. Parse SKILL.md frontmatter for name/description
# 2. Generate capability.yaml with TODOs for manual review
# 3. Create index.txt from the description
# 4. Generate summary.md (condensed version)
# 5. Copy full content to standard.md
# 6. Calculate accurate token budgets via tiktoken
```

After migration, review the `capability.yaml` and fill in:
- `provides` tags (beyond the default name)
- `requires` (tools, capabilities, context)
- `activation.triggers` (the migrator generates basic patterns)
- `state_schema` (if the capability maintains state)
- `priority` (default: medium)
