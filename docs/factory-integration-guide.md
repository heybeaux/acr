# ACR × Factory Integration Guide

**Author:** Kit 🦊
**Date:** 2026-03-07
**Status:** Implementation Plan

---

## Overview

The Factory currently dumps everything into worker prompts — the full ticket spec, rules, file constraints, and (if corrective) verifier feedback. Workers get no capability context beyond what's in the spec.

ACR integration adds **per-ticket capability resolution**: the Conductor analyzes each ticket's description, resolves the right capabilities at the right LOD levels, and injects a focused capability context block into the worker prompt. A NestJS ticket gets `nestjs:deep + prisma:standard`. A Storybook ticket gets `react:standard + storybook:deep`. No irrelevant context wasted.

## Architecture

```
                   ┌──────────────┐
                   │  Conductor   │
                   │  (tick loop) │
                   └──────┬───────┘
                          │
                   ┌──────▼───────┐
                   │ TaskResolver │  ← NEW: resolves capabilities per-ticket
                   │  + LODLoader │
                   └──────┬───────┘
                          │
              ┌───────────▼───────────┐
              │  buildWorkerPrompt()  │  ← MODIFIED: injects capability context
              └───────────┬───────────┘
                          │
                   ┌──────▼───────┐
                   │    Worker    │  Gets: spec + ACR context + rules
                   └──────────────┘
```

## Prerequisites

- ACR capabilities exist in a directory (e.g., `acr/migrated-final/` or a project-local `capabilities/` folder)
- `@agentcapabilityruntime/core` and `@agentcapabilityruntime/schema` are available (add as dependencies to `ops/factory`)

## Implementation Steps

### Step 1: Add ACR Dependencies

```bash
cd ~/projects/ops/factory
npm install @agentcapabilityruntime/core @agentcapabilityruntime/schema
# OR if using the local monorepo:
npm install ../../acr/packages/core ../../acr/packages/schema
```

### Step 2: Create the Capability Registry

Create a capability loader that initializes once at conductor startup.

```typescript
// factory/src/capabilities.ts

import { LODLoader, TaskResolver } from '@agentcapabilityruntime/core';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

let loader: LODLoader | null = null;
let resolver: TaskResolver | null = null;

/**
 * Initialize the ACR loader with capabilities from a directory.
 * Call once at conductor startup.
 */
export function initCapabilities(capabilitiesDir: string): void {
  loader = new LODLoader();

  // Register all capability directories
  const entries = readdirSync(capabilitiesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        loader.register(join(capabilitiesDir, entry.name));
      } catch (err) {
        console.warn(`[acr] Skipping ${entry.name}: ${(err as Error).message}`);
      }
    }
  }

  resolver = new TaskResolver(loader, {
    maxBudget: 15000,       // tokens reserved for capabilities
    defaultResolution: 'standard',
    primaryResolution: 'deep',
    maxCapabilities: 6,
  });

  console.log(`[acr] Loaded ${loader.stats.registered} capabilities`);
}

/**
 * Resolve capabilities for a ticket.
 * Returns the context block to inject into the worker prompt.
 */
export function resolveForTicket(ticketSpec: string): {
  context: string;
  tokenCost: number;
  capabilities: Array<{ name: string; resolution: string; tokens: number }>;
  reasoning: string[];
} {
  if (!resolver) {
    return { context: '', tokenCost: 0, capabilities: [], reasoning: ['ACR not initialized'] };
  }

  const resolution = resolver.resolve(ticketSpec);
  return {
    context: resolution.context,
    tokenCost: resolution.tokenCost,
    capabilities: resolution.capabilities,
    reasoning: resolution.reasoning,
  };
}

export function getLoader(): LODLoader | null {
  return loader;
}
```

### Step 3: Initialize at Conductor Startup

In `conductor.ts`, add initialization before the tick loop:

```typescript
import { initCapabilities } from './capabilities.js';

// In the main() function, before starting the tick loop:
const capabilitiesDir = config.capabilitiesDir
  ?? join(import.meta.dirname, '../../capabilities');  // default location

if (existsSync(capabilitiesDir)) {
  initCapabilities(capabilitiesDir);
  log('conductor', `ACR loaded from ${capabilitiesDir}`);
} else {
  log('conductor', chalk.yellow('No capabilities directory — running without ACR'));
}
```

### Step 4: Inject Capability Context into Worker Prompt

Modify `buildWorkerPromptDirect()` to include the resolved context:

```typescript
import { resolveForTicket } from './capabilities.js';

function buildWorkerPromptDirect(
  ticket: TicketInput,
  worktreePath: string,
  feedback?: string,
): string {
  // Resolve capabilities for this ticket
  const acr = resolveForTicket(`${ticket.summary}\n${ticket.spec}`);

  const parts = [
    'You are a factory worker agent. Your ONLY job is to implement the following ticket.',
    '',
    'TICKET: ' + ticket.id,
    'SUMMARY: ' + ticket.summary,
    '',
  ];

  // Inject ACR capability context (if resolved)
  if (acr.context) {
    parts.push(acr.context);
    parts.push('');
  }

  parts.push(
    'WORKTREE PATH: ' + worktreePath,
    '',
    'SPEC:',
    ticket.spec,
    '',
    // ... rest of the prompt (file operations, rules, etc.)
  );

  if (feedback) {
    parts.push(
      '',
      '## PREVIOUS ATTEMPT FEEDBACK — READ THIS FIRST',
      feedback,
    );
  }

  return parts.join('\n');
}
```

### Step 5: Log Capability Resolution

Add resolution logging to the ticket processing for observability:

```typescript
// In the WORKER_SPAWNED handler:
const acr = resolveForTicket(`${ticket.summary}\n${ticket.spec}`);

if (acr.capabilities.length > 0) {
  logTicket(job.ticket_id,
    `ACR: ${acr.capabilities.map(c => `${c.name}:${c.resolution}`).join(', ')} (${acr.tokenCost} tokens)`
  );
}

logEvent(db, {
  ticket_id: job.ticket_id,
  event_type: 'acr_resolution',
  detail: JSON.stringify({
    capabilities: acr.capabilities,
    tokenCost: acr.tokenCost,
    reasoning: acr.reasoning,
  }),
});
```

## Capability Authoring for Factory

Factory workers benefit most from capabilities that describe:
1. **Code patterns** — "Use dependency injection via constructor", "Always validate with class-validator DTOs"
2. **File structure conventions** — "Components go in src/components/{feature}/"
3. **Project-specific context** — design system tokens, API patterns, database schema conventions
4. **Verification checklists** — what constitutes "done" for this type of work

### Recommended Capabilities for GC (Generosity Catalyst)

| Capability | Purpose | Priority |
|---|---|---|
| `react-components` | Component patterns, file structure, props conventions | High |
| `storybook` | Story file requirements, variant patterns, visual QA setup | High |
| `supabase-rls` | Row-level security patterns, policy conventions | High |
| `gc-design-system` | Design tokens, color palette, spacing, typography | High |
| `nextjs-app-router` | App router patterns, server/client components, layouts | Medium |
| `stripe-integration` | Payment method handling, webhook patterns | Medium |
| `testing-patterns` | Test file conventions, mocking patterns | Medium |

### Creating a Project-Specific Capability

```yaml
# capabilities/gc-design-system/capability.yaml
name: gc-design-system
type: capability
version: 1.0.0
description: "Generosity Catalyst design system tokens and component patterns."

provides:
  - design-tokens
  - color-palette
  - spacing-system
  - typography

requires:
  tools: []
  capabilities: []
  context: []

budget:
  index: 15
  summary: 100
  standard: 800
  deep: 2000

activation:
  triggers:
    - type: pattern
      match: "(design tokens|color|spacing|typography|font|palette)"
    - type: pattern
      match: "(StatCard|RoleBadge|touchpoint-card|donor)"
    - type: pattern
      match: "(Figma|visual polish|redesign|UI)"
  trigger_logic: OR
  co_activates:
    - react-components
  conflicts: []

behavioral:
  core: |
    GC Design System:
    - Colors: primary=#2563eb, secondary=#64748b, success=#22c55e, error=#ef4444
    - Spacing: 4px base unit (4, 8, 12, 16, 24, 32, 48, 64)
    - Typography: Inter for UI, font-mono for code
    - Border radius: rounded-lg (8px) for cards, rounded-md (6px) for inputs
    - Shadows: shadow-sm for cards, shadow-md for modals
    - Always use Tailwind utility classes, never inline styles
    - Component files: src/components/{feature}/{component-name}.tsx
    - Story files: src/components/{feature}/{component-name}.stories.tsx
  overlays: []
```

## Verification

After integration, run a dry run to see capability resolution in action:

```bash
npx tsx src/conductor.ts ~/generosity-catalyst --label factory-ready --dry-run --limit 3
```

Expected output:
```
[GEN-142] ACR: react-components:deep, gc-design-system:standard, storybook:summary (4200 tokens)
[GEN-148] ACR: react-components:standard, supabase-rls:standard (2800 tokens)
[GEN-130] ACR: react-components:deep, gc-design-system:deep, nextjs-app-router:summary (5100 tokens)
```

## Token Budget Impact

| Scenario | Tokens | Notes |
|---|---|---|
| Current (no ACR) | 0 capability context | Workers rely entirely on spec |
| With ACR (3 caps) | ~3,000-5,000 | Right context for the task |
| With ACR (6 caps) | ~8,000-12,000 | Complex cross-cutting ticket |
| Budget cap | 15,000 max | TaskResolver enforces ceiling |

The spec itself is typically 1,000-3,000 tokens. ACR adds focused capability context at 2-5x the spec size — but unlike dumping all 30 skills (26K tokens), only relevant capabilities are loaded.

## Rollout Plan

1. **Phase 1: Capability authoring** — Create 5-7 GC-specific capabilities (react-components, storybook, gc-design-system, supabase-rls, nextjs-app-router)
2. **Phase 2: Integration** — Wire ACR into conductor.ts, add logging, run dry-run tests
3. **Phase 3: A/B validation** — Run 5 tickets with ACR, 5 without, compare first-try pass rates and corrective loop frequency
4. **Phase 4: Engram feedback loop** — Store resolution results + outcomes in Engram for cross-run learning

## Open Questions

1. **Capabilities per-repo or global?** GC needs different capabilities than Engram. Options: (a) separate capability dirs per repo, (b) single dir with project-scoped triggers, (c) config in `.factory.env`
2. **Should the verifier also get capability context?** Currently only workers get it. If the verifier understands the design system, it could give more specific feedback.
3. **Capability hot-reload?** If capabilities are edited during a run, should the conductor pick up changes? LODLoader caches — would need `clearCache()` on tick.

---

*Guide by Kit 🦊 — ready for implementation when Beaux gives the green light.*
