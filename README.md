<div align="center">

# Agent Capability Runtime

**The missing context layer for AI agents.**

ACR manages what goes into an agent's context window — which capabilities are loaded, at what resolution, within what budget. Think of it as the operating system between an agent and its tools.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-88%20passing-brightgreen.svg)](#)
[![Spec](https://img.shields.io/badge/spec-v1.0--rc1-orange.svg)](./specs/agent-capability-runtime.md)

</div>

---

## The Problem

Every AI agent framework loads tool instructions the same way: dump everything into the context window and hope for the best.

An agent with 30 tools burns **26,000+ tokens** on tool instructions before a single user message. That's 20% of a 128K context window — gone. The agent gets shorter conversations, more frequent compaction, and worse performance on the tasks that actually matter.

**The current approach doesn't scale.** As agents get more capable and accumulate more tools, the problem gets exponentially worse.

## The Solution

### The Workshop Analogy

Imagine a woodworker's shop. They own 30 tools — saws, drills, chisels, screwdrivers, clamps, planes. They can't lay every tool on the workbench at once. There'd be no room to actually work.

But they **know what they own**. They glance around the shop and know every tool on every shelf. When someone says "I need to hang shelves," they pull out the drill, the level, and the right screwdriver. Everything else stays on the shelf — not forgotten, just not needed right now.

That's how ACR works. The agent is the woodworker. The context window is the workbench. The capabilities are the tools.

| What the woodworker does | What ACR does |
|--------------------------|---------------|
| Glances around the shop — knows what they own | **Index level** — every capability loaded as a one-liner (~15 tokens each) |
| Picks up a screwdriver — "Phillips, good for drywall screws, don't over-torque" | **Summary level** — enough to decide if this is the right tool |
| Starts using it — recalls bit sizes, pre-drilling rules, torque specs | **Standard/Deep level** — full working knowledge |
| Finishes and puts it back on the shelf | **Eviction** — demotes back to index, frees up the workbench |

The workbench has a size limit. If someone asks for woodworking, plumbing, AND electrical at once, you can't have all three manuals open. ACR decides: "woodworking is the primary task — load that fully. Plumbing was mentioned — load a summary. Electrical wasn't mentioned — stays on the shelf." That prioritization is the **budget system**.

### The Numbers

```
Without ACR:  30 tools × 900 tokens each = 26,498 tokens (20.7% of window)
With ACR:     30 tools at index level    =    473 tokens  (0.4% of window)
              3 active tools at full     =  2,287 tokens  (1.8% of window)
```

**98% token reduction at cold start. 91% reduction with active tools.** Not theoretical — measured against 30 real production capabilities.

### How It Works (Technical)

Every capability has four resolution levels:

| Level | Size | When Used |
|-------|------|-----------|
| **Index** | ~15 tokens | "I have this tool" — cold start awareness |
| **Summary** | ~100 tokens | "Here's what it does" — evaluation |
| **Standard** | ~500 tokens | "Here's how to use it" — active use |
| **Deep** | ~2000 tokens | "Here's everything about it" — primary focus |

ACR dynamically promotes and demotes capabilities based on what the agent actually needs:

```
User: "Create a NestJS endpoint for user auth with Prisma"

ACR resolves:
  nestjs      → deep     (primary focus — on the workbench, in hand)
  prisma-gen  → standard (actively needed — on the workbench)
  linear      → summary  (might be relevant — within arm's reach)
  27 others   → index    (on the shelf — known but not needed)
```

The agent gets exactly the context it needs, nothing more.

## Quick Start

```bash
# Install
npm install @acr/core @acr/schema @acr/cli

# Migrate existing skills
acr migrate ./skills/my-skill/SKILL.md

# Validate
acr validate ./my-capability

# Check budget
acr budget ./capabilities/

# Lint content quality
acr lint --all ./capabilities/

# Search capabilities
acr search "database" ./capabilities/
```

## For Agent Frameworks

### OpenClaw Integration

```typescript
import { LODLoader, TaskResolver } from '@acr/core';

// Load capabilities
const loader = new LODLoader();
loader.registerAll(capabilityDirs);

// Resolve for a task (Factory-style worker spawning)
const resolver = new TaskResolver(loader);
const { context, tokenCost } = resolver.resolve(
  'Implement NestJS auth service with Prisma ORM'
);

// Inject into agent prompt
const prompt = `${systemPrompt}\n\n${context}\n\n${userMessage}`;
```

### Dynamic Context Management

```typescript
import { ContextManager } from '@acr/core';

const ctx = new ContextManager({
  windowSize: 128000,
  residentBudget: 5000,
  sessionId: 'session-1',
  defaultPermissionPolicy: 'allow-with-log',
});

// Register capabilities (cold — index only)
ctx.register(manifest);

// Mount when needed (promotes to standard/deep)
await ctx.mount('nestjs', 'deep');

// Auto-trigger on user messages
const triggers = ctx.processMessage('Create a Prisma migration for the users table');
// → auto-mounts prisma-gen at standard

// State survives eviction
await ctx.unmount('nestjs');
// → state serialized, restored on next mount
```

### Multi-Agent Spawning

```typescript
import { resolveFromTask, TaskResolver, LODLoader } from '@acr/core';

// Parent resolves capabilities for child worker
const config = resolveFromTask(taskResolver, ticket.description, {
  sessionId: `worker-${ticket.id}`,
  maxBudget: 50000,
});

// config.capabilities = ['nestjs', 'prisma-gen']
// config.resolutions = { nestjs: 'deep', prisma-gen: 'standard' }
// config.policy.allowed_capabilities = ['nestjs', 'prisma-gen']
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Agent Session                   │
├──────────────────────────────────────────────────┤
│  ACR Runtime                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Context   │ │ Trigger  │ │ Capability       │ │
│  │ Manager   │ │ Engine   │ │ Proxy            │ │
│  └─────┬────┘ └────┬─────┘ └────────┬─────────┘ │
│        │           │                │             │
│  ┌─────┴────┐ ┌────┴─────┐ ┌───────┴──────────┐ │
│  │ LOD      │ │ State    │ │ Session          │ │
│  │ Loader   │ │ Store    │ │ Policies         │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
├──────────────────────────────────────────────────┤
│  Capabilities (index / summary / standard / deep) │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │
│  │NestJS│ │Prisma│ │Linear│ │GitHub│ │ ... │      │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘      │
└──────────────────────────────────────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| **Context Manager** | Orchestrates mount/unmount, budget enforcement, eviction |
| **LOD Loader** | Reads capability content at the right resolution |
| **Trigger Engine** | Pattern + semantic matching for auto-activation |
| **Capability Proxy** | Permission enforcement, escalation, audit logging |
| **State Store** | Serializes capability state across eviction cycles |
| **Task Resolver** | Resolves capabilities from task descriptions (Factory integration) |
| **Spawn Resolver** | Capability inheritance for multi-agent scenarios |
| **Observer** | Metrics, timeline, debug mode, event handlers |

## ACR + MCP

ACR is not a replacement for MCP. It's the complementary layer.

**MCP** standardizes the wire — how agents discover and call tools.
**ACR** standardizes the context — which tool instructions are loaded, at what detail level, within what budget.

Without ACR, an agent with 50 MCP tools loads all 50 instruction sets. With ACR, it loads 50 one-liners and promotes only what's needed.

[Read the full positioning →](./docs/mcp-positioning.md)

## Capability Format

```yaml
name: nestjs
type: capability
version: 1.0.0
description: "NestJS backend development patterns"

provides:
  - nestjs
  - backend-api

requires:
  tools: [nest-cli]
  capabilities:
    - name: prisma-gen
      resolution: summary

budget:
  index: 15       # ~15 tokens: "nestjs: Backend API development with NestJS"
  summary: 100    # ~100 tokens: key patterns, when to use
  standard: 600   # ~600 tokens: full working reference
  deep: 2000      # ~2000 tokens: complete API docs, edge cases

activation:
  triggers:
    - type: pattern
      condition: "(?i)\\b(nestjs|nest\\.js|nest service)\\b"
    - type: semantic
      condition: "backend API development with Node.js"

priority: medium

state_schema:
  version: 1
  max_size_tokens: 200
  fields:
    - name: currentModule
      type: string
```

[Full authoring guide →](./docs/authoring-guide.md)

## CLI

```bash
acr validate <path>          # Validate capability schema
acr validate --all <dir>     # Validate all capabilities
acr lint <path>              # Lint LOD content quality
acr lint --all <dir>         # Lint all capabilities
acr migrate <SKILL.md>       # Convert legacy skill to ACR format
acr budget <path>            # Calculate context window budget
acr resolve <path>           # Show dependency resolution plan
acr search <query> <dir>     # Search capabilities
```

## Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| 0. Validation | ✅ Complete | Format validated against 30 production skills |
| 1. Core Runtime | ✅ Complete | Schema, validator, resolver, budget calculator, CLI |
| 2. Dynamic Runtime | ✅ Complete | Context manager, triggers, state, proxy, policies |
| 3. Framework Adapter | ✅ Complete | OpenClaw adapter, 94-95% token savings measured |
| 4a. Intelligence | ✅ Complete | Semantic triggers, priority eviction, tiktoken |
| 4b. Production | ✅ Complete | File state store, observability, linter |
| 4c. Ecosystem | ✅ Complete | Registry, search, authoring guide |
| 5. Multi-Agent | ✅ Complete | Spawn resolver, capability inheritance, MCP positioning |

**88 tests passing** across 6 test suites. **~5,000 lines** of TypeScript across 34 source files.

## Spec

The formal specification is at [`specs/agent-capability-runtime.md`](./specs/agent-capability-runtime.md) (v1.0-rc1, 784 lines).

It covers:
- Layer model (Primitives → Capabilities → Capability Sets → Roles)
- LOD resolution system
- Manifest format and schema
- Dynamic mounting lifecycle
- Budget enforcement and eviction
- Trigger system
- State persistence
- Security model
- Session policies

## Contributing

ACR is MIT-licensed and open to contributions. Areas where help is needed:

- **Framework adapters** — LangChain, LangGraph, CrewAI, AutoGen
- **Capability library** — convert popular tool sets to ACR format
- **Registry service** — remote capability discovery and publishing
- **Testing** — edge cases, stress testing, real-world validation

## License

MIT © [heybeaux](https://github.com/heybeaux)
