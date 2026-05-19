# ACR — Deep

Loaded when designing in or debugging ACR. Token budget ~2500.

## LOD semantics

Four levels — *relevance* gradient, not quality:

| Level | Avg | When used |
|-------|-----|-----------|
| Index | ~20 | "I have this tool" — cold-start awareness, always resident |
| Summary | ~95 (tools) / ~200 (projects) | "Here's what it does" — evaluation |
| Standard | ~1250 | "Here's how to use it" — active use |
| Deep | ~2500+ | "Here's everything" — primary focus |

Promotion happens via trigger matching against the current user message; demotion when context shifts. Triggers are pattern-based (regex), precompiled at registration. Spec recommends batching evaluation for registries with 100+ capabilities.

## Numbers (from README)

- Without ACR: 30 tools × 1,256 avg tokens = 37,682 tokens (29.4% of 128K window)
- With ACR cold start: 30 tools × index = 597 tokens (0.5%)
- With 3 active tools at standard + index for rest: 12,981 tokens (10.2%)
- Task Resolver average: 1,626 tokens per resolution (96% reduction vs naive)

## Capability schema

`capability.yaml` fields: `name`, `type`, `version`, `description`, `provides`, `requires`, `budget`, `activation`, `permissions`, `behavioral`, `state_schema`, `verification`.

Activation triggers:
- `type: pattern` — regex against user message (fastest)
- Other types defined in spec (state-based, capability-based)
- `trigger_logic: OR | AND` combines multiple triggers
- `co_activates` / `conflicts` cross-reference other capabilities

## Registry protocol

Spec defines publish / install / search / validate operations. Any ACR-compatible registry SHOULD support all four. Capabilities distributed as packages. The territory federation pattern (this repo) is *one* registry shape — others are possible.

## Key decisions

- **4-level LOD** chosen over continuous resolution because discrete levels are easier to budget, debug, and reason about.
- **Pattern triggers as the fast path** — regex precompilation at registration so trigger eval is sub-ms per capability.
- **Project cards use summary:200** (this repo's convention) — tool-card budget too tight for "what is Sonder" answers.

## Internal vocabulary

- **LOD** = level-of-detail
- **Index level** = always-resident one-liner
- **TaskResolver** = picks which capabilities to promote for a given task
- **ContextManager** = budget-aware window manager
- **RegistryEntry** = capability metadata at index level
- **Capability** = a unit of tool/skill/territory knowledge

## Boundaries

- ACR **does** load, resolve, budget, validate, lint capabilities.
- ACR **does not** call tools, decide policy, sign events, or render UIs.
- ACR **is** the substrate other faculties' capabilities are loaded through.
