---
layout: default
title: ACR — Agent Capability Runtime
description: The missing context layer for AI agents. Dynamic capability loading with Level of Detail.
---

# Agent Capability Runtime

**The missing context layer for AI agents.**

ACR manages what goes into an agent's context window — which capabilities are loaded, at what resolution, within what budget.

MCP standardizes how agents *call* tools. ACR standardizes how agents *load* the instructions for those tools. They're complementary layers.

---

## The Problem

AI agents accumulate tools. Each tool needs instructions in the context window. The more tools an agent has, the less room it has for actual work.

**30 tools × ~900 tokens = 26,498 tokens consumed before the first message.**

That's 20% of a 128K context window. Gone. Every session.

## The Solution: Level of Detail

ACR introduces LOD — the same technique that lets video games render entire worlds by varying detail with distance.

| Level | Purpose | Size |
|-------|---------|------|
| **Index** | "I exist" | ~15 tokens |
| **Summary** | "Here's what I do" | ~100 tokens |
| **Standard** | "Here's how" | ~500 tokens |
| **Deep** | "Here's everything" | ~2000 tokens |

**Cold start:** All 30 capabilities at index = **473 tokens** (0.4% of window)
**Active use:** 3 capabilities at full detail = **2,287 tokens** (1.8% of window)
**Today without ACR:** All 30 at full detail = **26,498 tokens** (20.7% of window)

Capabilities promote and demote dynamically based on relevance, triggers, and budget pressure.

---

## How It Works

### 1. Register capabilities at index level

```
nestjs: Backend API development with NestJS framework
prisma: Database ORM and schema management with Prisma
linear: Project management and issue tracking with Linear
... (27 more, ~15 tokens each)
```

Total: ~473 tokens for awareness of 30 capabilities.

### 2. Auto-activate on relevance

When the user says *"Create a NestJS endpoint with Prisma"*, ACR's trigger engine:
- Pattern-matches "NestJS" and "Prisma"
- Promotes `nestjs` to **deep** (primary focus)
- Promotes `prisma` to **standard** (supporting)
- Everything else stays at **index**

### 3. Manage budget dynamically

If the context window gets full, ACR:
- Demotes least-relevant capabilities (priority-weighted eviction)
- **Serializes state** before eviction (restored on next mount)
- Enforces dependency floors (don't demote below what dependents need)
- Reports what happened via the observability layer

### 4. Persist state across eviction

When a capability is evicted for budget, its working state is serialized. When re-mounted, it picks up where it left off. The agent doesn't lose context — it just temporarily unloads it.

---

## Capability Format

```yaml
name: nestjs
type: capability
version: 1.0.0
description: "NestJS backend development patterns"

provides: [nestjs, backend-api]
requires:
  capabilities:
    - name: prisma-gen
      resolution: summary

budget:
  index: 15
  summary: 100
  standard: 600
  deep: 2000

activation:
  triggers:
    - type: pattern
      condition: "(?i)\\b(nestjs|nest\\.js)\\b"
    - type: semantic
      condition: "backend API development"

state_schema:
  version: 1
  max_size_tokens: 200
  fields:
    - name: currentModule
      type: string
```

Each capability is a directory:

```
nestjs/
├── capability.yaml   # Manifest
├── index.txt         # ~15 tokens
├── summary.md        # ~100 tokens
├── standard.md       # ~600 tokens
└── deep.md           # ~2000 tokens
```

---

## For Framework Authors

ACR is framework-agnostic. It provides the runtime primitives — your framework provides the integration.

### Integration Surface

```typescript
import { ContextManager, LODLoader, TaskResolver } from '@acr/core';

// For chat agents: dynamic per-turn context management
const ctx = new ContextManager({ windowSize: 128000, sessionId: 'chat-1' });
ctx.register(manifest);
const triggers = ctx.processMessage(userMessage);

// For worker agents: one-shot capability resolution at spawn
const resolver = new TaskResolver(loader);
const { context } = resolver.resolve(taskDescription);
```

### Existing Adapters

- **OpenClaw** — full adapter, tested against 30 production skills

### Wanted

- LangChain / LangGraph
- CrewAI
- AutoGen / AG2
- Custom frameworks

---

## ACR + MCP

| Concern | MCP | ACR |
|---------|-----|-----|
| Tool discovery | ✅ | — |
| Tool execution | ✅ | — |
| Context budget | — | ✅ |
| Dynamic loading | — | ✅ |
| State persistence | — | ✅ |
| Multi-resolution | — | ✅ |

MCP tells the agent what tools exist. ACR tells the agent which tool instructions to load right now and at what detail level.

[Full positioning →](./mcp-positioning.md)

---

## Project

- **Spec:** [v1.0-rc1](https://github.com/heybeaux/acr/blob/main/specs/agent-capability-runtime.md) (784 lines)
- **Runtime:** TypeScript monorepo — `@acr/schema`, `@acr/core`, `@acr/cli`
- **Tests:** 88 passing across 6 suites
- **License:** MIT
- **Status:** All phases complete. Seeking framework integrations and community feedback.

[GitHub →](https://github.com/heybeaux/acr)

---

<div align="center">
<em>ACR is an open specification. Contributions, framework adapters, and feedback welcome.</em>
</div>
