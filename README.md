# Agent Capability Runtime (ACR)

**Framework-agnostic spec and tooling for composing agent capabilities.**

The current AI agent ecosystem treats skills and tools as flat, unrelated primitives. ACR introduces a layered architecture for composing, resolving, loading, and managing agent capabilities — with manifest-driven bundles, multi-resolution context (LOD), dependency resolution, budget management, and scope-restricted security.

> Think `package.json` for agent skills, with a runtime that manages context like an OS manages memory.

## Status

🚧 **Early development** — Schema and CLI in progress. [Full spec (v1.0-draft)](https://github.com/heybeaux/ops/blob/main/specs/agent-capability-runtime.md).

## Quick Start

```bash
# Migrate an existing skill
acr migrate ./my-skill/SKILL.md

# Validate a capability
acr validate ./my-capability

# Check budget
acr budget ./my-capability --window 128000

# Resolve dependencies
acr resolve ./capabilities/
```

## Core Concepts

### Capability Manifest

Every capability has a `capability.yaml`:

```yaml
name: github-pr-review
type: capability
version: 1.0.0
description: "Review GitHub PRs for quality and security"

provides:
  - code-review
  - pr-management

requires:
  tools:
    - mcp: github
      methods: [get_pull_request, create_review]

budget:
  index: 15        # ~one line, always loaded
  summary: 200     # key info, when potentially relevant
  standard: 1800   # full instructions, when active
  deep: 5500       # includes examples + reference docs

activation:
  triggers:
    - type: pattern
      match: "review (this |the )?PR"
```

### Multi-Resolution Context (LOD)

Capabilities exist at four fidelity levels — loaded progressively based on need:

| Level | Size | When |
|-------|------|------|
| **Index** | ~15 tok | Always (capability registry) |
| **Summary** | ~200 tok | Potentially relevant |
| **Standard** | ~2K tok | Actively used |
| **Deep** | ~5K tok | Complex tasks |

### Architecture

```
Roles → Capability Sets → Capabilities → Primitives
                                              ↑
                          Context Manager (Resolver + Loader + Proxy)
```

## Packages

| Package | Description |
|---------|-------------|
| `@acr/schema` | JSON Schema + TypeScript types |
| `@acr/core` | Validator, resolver, budget calculator, migration |
| `@acr/cli` | CLI tooling (`acr validate`, `acr migrate`, etc.) |

## Design Influences

- **OS Virtual Memory** → Context zones, dynamic mounting, LRU eviction
- **Dynamic Linking** → Dependency resolution, provides/requires
- **3D Graphics LOD** → Multi-resolution context
- **Package Managers** → Manifests, semver, lockfiles
- **CSS Cascading** → Overlay priority system

## Origin

Created via multi-model panel consultation (Gemini 3.1 Pro, GPT 5.4, Claude Opus 4.6) with two review rounds. All three models independently converged on the same architecture.

## License

MIT — © 2026 [heybeaux.dev](https://heybeaux.dev)
