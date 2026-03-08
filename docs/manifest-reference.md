# Capability Manifest Reference

Complete field reference for `capability.yaml`.

## Required Fields

### `name` (string, required)
Unique identifier. Lowercase, hyphens, dots allowed. Must start with a letter.
```yaml
name: github-pr-review
```

### `version` (string, required)
Semantic version.
```yaml
version: 1.2.0
```

### `type` (enum, required)
- `capability` — An individual capability with behavioral instructions
- `capability-set` — A bundle grouping other capabilities (no `behavioral` section)
```yaml
type: capability
```

### `description` (string, required)
Human-readable description. 10-500 characters.
```yaml
description: "Review GitHub pull requests for code quality and security"
```

### `provides` (string[], required)
Tags declaring what this capability offers. Used for conflict detection and search. At least one required.
```yaml
provides:
  - code-review
  - pr-management
```

### `budget` (object, required)
Token counts at each resolution level. Each level includes all content from lower levels.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `index` | integer | Yes | ~15 tokens. One-line description. |
| `summary` | integer | Yes | ~200 tokens. Key info. |
| `standard` | integer | Yes* | ~2K tokens. Full instructions. (*0 for capability-sets) |
| `deep` | integer | No | ~5K tokens. With examples + refs. |
| `children_total` | integer | No | Total budget for child capabilities (capability-sets only). |
| `overflow_policy` | enum | No | `demote_lowest_priority` (default), `error`, `request_human` |

```yaml
budget:
  index: 15
  summary: 200
  standard: 1800
  deep: 5500
```

## Optional Fields

### `requires` (object)
Dependencies this capability needs.

#### `requires.tools` (ToolRequirement[])
MCP tool servers required.
```yaml
requires:
  tools:
    - mcp: github
      methods: [get_pull_request, create_review]
      optional: false
```

#### `requires.capabilities` (CapabilityRequirement[])
Other capabilities this one depends on.
```yaml
requires:
  capabilities:
    - name: git-basics
      resolution: summary    # index | summary | standard | deep
      optional: false
```

#### `requires.context` (ContextRequirement[])
Named reference documents.
```yaml
requires:
  context:
    - ref: team-coding-standards
      optional: true
```

### `activation` (object)
When and how to activate this capability.

#### `activation.triggers` (Trigger[])
```yaml
activation:
  triggers:
    - type: pattern              # regex on conversation
      match: "review (this )?PR"
    - type: runtime_event        # system state check
      condition: tool_available("github")
  trigger_logic: OR              # OR (any trigger) | AND (all triggers)
```

#### `activation.co_activates` (string[])
Capabilities to co-mount when this one activates.

#### `activation.conflicts` (string[])
Capabilities that cannot coexist with this one.

### `constraints` (string[])
Hard rules that MUST be followed when this capability is active. Surfaced at summary LOD or higher. Injected as a dedicated `⚠️ CONSTRAINTS (MUST follow)` section before any capability content in generated context.

Use for import paths, naming conventions, or patterns that override model training defaults. Use imperative language (NEVER, ALWAYS, MUST, DO NOT) for strongest adherence.

```yaml
constraints:
  - "NEVER import from @storybook/react — ALWAYS use @storybook/nextjs"
  - "ALWAYS use CSF3 format for component stories"
  - "DO NOT use deprecated API v1 endpoints"
```

**Why this exists:** Model training data can overpower reference material in standard LOD content. Constraints get priority positioning in the prompt to counteract this. See the gc-storybook example for a real-world case.

### `file_patterns` (string[])
File extensions or glob patterns that boost this capability's priority during task resolution. When a TaskResolver is configured with `outputFiles` and a file matches, the capability receives a significant score boost and primary (deep) resolution.

```yaml
file_patterns:
  - ".stories.tsx"
  - ".stories.ts"
  - ".test.ts"
  - "*.prisma"
```

### `permissions` (object)
Enforced by the Capability Proxy.

```yaml
permissions:
  tools:
    github:
      get_pull_request: allow
      merge_pull_request: deny
  data:
    repo_contents: read-only     # read-only | read-write | never
```

### `behavioral` (object, required for type: capability)
Agent instructions.

#### `behavioral.core` (string)
The irreducible instructions. Always loaded at standard resolution and above.

#### `behavioral.overlays` (Overlay[])
Composable modifiers. Higher priority wins conflicts.
```yaml
behavioral:
  core: |
    When reviewing a PR:
    1. Check CI status first
    2. Review diff file-by-file
  overlays:
    - ref: team-tone-guide
      optional: true
      priority: 10
```

### `state_schema` (object)
Fields to preserve when this capability is evicted mid-task.

```yaml
state_schema:
  version: 1                    # Increment on breaking changes
  max_size_tokens: 300          # Budget for serialized state
  fields:
    - name: target_pr
      type: string              # string | number | boolean | string[] | object | object[]
    - name: files_reviewed
      type: string[]
```

### `verification` (object)
Self-check contract.

```yaml
verification:
  checklist:
    - "Inspected the diff"
    - "Checked CI status"
  completion_signal: review_delivered
```

## Capability Set Fields

Capability sets use `type: capability-set` and MUST NOT define `behavioral`. They bundle other capabilities:

```yaml
name: engineering.code-change
type: capability-set
version: 1.0.0
description: "Full code change lifecycle"

provides:
  - code-change-lifecycle

requires:
  capabilities:
    - name: git-basics
      resolution: standard
    - name: github-pr-review
      resolution: standard

budget:
  index: 20
  summary: 100
  standard: 0
  deep: 0
  children_total: 8000
  overflow_policy: demote_lowest_priority
```
