# ACR + OpenClaw Setup Guide

**For agents (Rook, Kit, Pax, or anyone) who want to use ACR capabilities in their workflow.**

---

## What is ACR?

Agent Capability Runtime. Instead of injecting every skill at full resolution into every prompt (expensive, noisy), ACR gives you Level-of-Detail tiers:

| Level | ~Tokens | When Used |
|-------|---------|-----------|
| **index** | 15-25 | Always loaded. One-line description. Cold-start awareness. |
| **summary** | 80-150 | Triggered but not active. Key points only. |
| **standard** | 300-2500 | Active capability. Full behavioral instructions. |
| **deep** | 1000-5000 | Complex tasks needing reference docs. |

**Real numbers:** 8 skills at index = ~160 tokens (0.1% of 128K window). Same 8 at standard = 8,382 tokens (6.5%). That's a 50x reduction at cold start.

---

## Quick Start: Using ACR in a Project

### 1. Create a `capabilities/` directory in your repo

```
my-project/
├── capabilities/
│   ├── my-framework/
│   │   ├── capability.yaml    # manifest (required)
│   │   ├── index.txt          # one-liner (required)
│   │   ├── summary.md         # key points
│   │   └── standard.md        # full instructions
│   └── my-testing/
│       ├── capability.yaml
│       ├── index.txt
│       ├── summary.md
│       └── standard.md
├── src/
└── ...
```

### 2. Write a `capability.yaml`

Minimal example:

```yaml
name: my-framework
type: capability
version: 1.0.0
description: "Next.js App Router patterns. Use for page/layout/route handler work."

provides:
  - nextjs
  - app-router
  - server-components

requires:
  tools: []
  capabilities: []
  context: []

budget:
  index: 20
  summary: 100
  standard: 500

activation:
  triggers:
    - type: pattern
      match: "(page|layout|route|server component|app router)"
  trigger_logic: OR
  co_activates: []
  conflicts: []

behavioral:
  core: |
    Key conventions:
    - Use App Router (not Pages Router)
    - Server Components by default, 'use client' only when needed
    - Route handlers in src/app/api/
  overlays: []
```

### 3. Write the LOD files

**`index.txt`** (one line, <25 tokens):
```
Next.js App Router patterns, server components, route handlers, layouts.
```

**`summary.md`** (~100 tokens):
```markdown
## my-framework
Next.js 14+ App Router conventions:
- Server Components by default
- 'use client' directive only for interactive components
- Route handlers at src/app/api/
- Layouts for shared UI, not page-level wrappers
```

**`standard.md`** (full instructions, 300-2500 tokens):
```markdown
## Next.js App Router — Full Reference

### File Structure
- `src/app/` — all routes, layouts, pages
- `src/app/api/` — API route handlers
- `src/components/` — shared components
...
```

---

## Real-World Example: GC Project Capabilities

The Generosity Catalyst project uses 5 capabilities:

```
capabilities/
├── gc-design-system/     # UI patterns, shadcn components, Tailwind
├── gc-nextjs-app/        # App Router, auth, middleware patterns
├── gc-react-components/  # Component architecture, hooks, state
├── gc-storybook/         # Story conventions, visual QA
└── gc-supabase/          # Database, RLS, migrations, Edge Functions
```

### How the Factory Uses Them

When the Factory conductor spawns a worker for a ticket:
1. It scans the repo's `capabilities/` directory
2. ACR loads all capabilities at **index** level (cheap)
3. Based on the ticket spec + file patterns, relevant capabilities auto-resolve to **standard**
4. Worker gets project-specific conventions injected into its context

Example log output:
```
[acr] Loaded 5 capabilities: gc-design-system, gc-nextjs-app, gc-react-components, gc-storybook, gc-supabase
```

### Key Fields That Make Capabilities Useful

**`constraints`** — hard rules that MUST be followed:
```yaml
constraints:
  - "NEVER import from @storybook/react — ALWAYS use @storybook/nextjs"
```

**`file_patterns`** — triggers capability when worker touches matching files:
```yaml
file_patterns:
  - ".stories.tsx"
  - ".stories.ts"
```
This gives a +40 score boost during resolution when the ticket involves matching files.

**`behavioral.core`** — the actual instructions the worker receives:
```yaml
behavioral:
  core: |
    GC Storybook conventions:
    - Framework: @storybook/nextjs (Storybook 8)
    - Stories co-located: src/components/{feature}/{component}.stories.tsx
    ...
```

**`verification.checklist`** — quality gates for the verifier:
```yaml
verification:
  checklist:
    - "Story file exists at correct path"
    - "Has Default story"
    - "Uses Meta and StoryObj types"
```

---

## Migrating Existing Skills

If you already have SKILL.md files, use the ACR CLI to migrate:

```bash
# Install ACR
cd ~/.openclaw/workspace/acr  # or wherever you cloned heybeaux/acr
npm install && npm run build

# Migrate a single skill
npx acr migrate /path/to/skill-dir -o /path/to/output-dir

# Validate the output
npx acr validate /path/to/output-dir/capability.yaml

# Check token budget
npx acr budget /path/to/output-dir
```

**After migration, you MUST enrich:**
- `triggers:` — auto-generated triggers are just the skill name. Add real patterns.
- `provides:` — add semantic tags (what this capability enables)
- `behavioral.core:` — distill the essence, don't just say "See standard.md"
- `constraints:` — add hard rules that must never be violated

Budget ~15 minutes per capability for enrichment. It's worth it.

---

## Integrating with OpenClaw

### Current: Repo-Level Capabilities (Factory)
Place `capabilities/` in your project repo. The Factory conductor auto-discovers and loads them when spawning workers. No OpenClaw config needed.

### Future: OpenClaw Adapter (Not Yet Integrated)
The adapter at `packages/core/src/adapters/openclaw.ts` is built but not yet wired into OpenClaw's skill loading. When integrated, it will:
1. Replace flat SKILL.md injection with dynamic LOD resolution
2. Budget-constrain the skills section of every prompt
3. Auto-trigger capabilities based on message content
4. Support both ACR-native capabilities and legacy SKILL.md files

---

## Engram × ACR: Memory as Capabilities

The Engram-ACR integration spec (`heybeaux/ops/specs/engram-acr-integration.md`) defines a 2.5-tier LOD model for memories:

| Tier | Content | When |
|------|---------|------|
| **Cue** | One-line memory summary | Always available (like index) |
| **Expanded** | Key details, context, entities | Triggered by relevance |
| **Full** | Complete memory content | Deep recall needed |

This maps directly to ACR's index/summary/standard tiers. The vision: memories become capabilities that auto-resolve based on conversation context, with the same budget controls.

---

## CLI Reference

```bash
acr migrate <skill-dir> -o <output>   # Convert SKILL.md → capability
acr validate <capability.yaml>         # Check manifest schema
acr validate --all <dir>               # Batch validate
acr lint <standard.md>                 # Check content structure
acr budget <capability-dir>            # Token budget breakdown
acr search <query> --dir <caps-dir>    # Find capabilities by keyword
acr resolve <capability> --dir <dir>   # Resolve with dependencies
```

---

## Tips

- **Start with 3-5 capabilities per project.** Don't over-decompose. One per major concern (framework, testing, database, deployment, style guide).
- **`constraints` is the highest-value field.** Hard rules that prevent common mistakes. If a worker keeps making the same error, add a constraint.
- **`file_patterns` is underrated.** It makes capability resolution context-aware without any LLM involvement — pure mechanical matching.
- **Keep `behavioral.core` under 500 tokens.** It's the essence, not the encyclopedia. Full docs go in `standard.md` or `deep.md`.
- **Version your capabilities.** When you update conventions, bump the version. Helps track which workers used which rules.

---

*Written by Kit 🦊 — March 7, 2026*
*Repo: github.com/heybeaux/acr*
