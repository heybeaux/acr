# ACR for Bespoke Per-Client Agents

**Audience:** Trevan (Share)
**Question on the table:** Can Share roll out production-grade, 1-to-1 agents — one bespoke agent per client — without it collapsing under its own weight? And is ACR the right tool to make that scale?

**Short answer:** Yes, and yes. A per-client agent in ACR is a *config file*, not a *fork of a codebase*. That single fact is what makes the 1-to-1 model scale instead of becoming N codebases to maintain.

---

## The scaling problem

The naive way to do "an agent per client" is to copy the agent and hand-edit it for each client. That gives you N copies to keep in sync. Fix a bug or ship a new capability and you're editing it N times. At 5 clients it's annoying; at 50 it's unmanageable. This is the fear behind "almost impossible to scale" — and it's a correct fear *for that approach*.

## What ACR changes

ACR (Agent Capability Runtime) is a context-management OS for agents. Its core unit is a **capability manifest** — a small YAML file describing one thing an agent can do: what it offers, what tools and data it can touch, how it behaves, and how many tokens it costs at each level of detail.

A **capability-set** is a manifest that bundles other capabilities. **A per-client agent is just a capability-set.** Composing a client agent means writing one YAML that lists capabilities, scopes permissions, and sets the voice — not duplicating code.

```
client-acme-agent (capability-set)
├── behavioral.core          → who this agent is (shared engineering competence)
│   └── overlays:
│       └── acme-tone        → Acme's specific voice, layered on top
├── requires.capabilities    → the skills this client gets
│   ├── engram-recall        → memory
│   ├── github
│   └── report-writer
├── requires.context         → client identity / brief / brand docs
└── permissions              → scoped: read-only on Acme data, no destructive actions
```

To onboard the next client, copy the set, swap the overlay + context refs + permission scope, done. The capabilities underneath are shared and versioned once. Fix `report-writer` and every client benefits the same day. **N clients, one codebase.**

## Where personality lives

This is the part Beaux asked about directly: *can ACR shape each agent's personality?*

Yes — every capability manifest already has a `behavioral` block:

- `behavioral.core` — the irreducible "who am I": voice, temperament, operating principles. This is real, in the schema today.
- `behavioral.overlays` — layered, **priority-ordered** modifiers. Higher priority wins conflicts.

That two-layer design is exactly what per-client personalization wants: keep one strong engineering *core* that every Share agent shares, then layer a **per-client tone overlay** on top. Acme gets Acme's voice; the underlying competence is identical and maintained once. Trevan shapes a client by writing an overlay, not by retraining or forking anything.

## "Send a Kit file to another machine and it just works"

Beaux's mental model — *email someone a Kit ACR file and that personality + those capabilities light up on their agent* — is the design intent, not a stretch. A capability-set is portable by definition: it's a manifest plus references to capabilities resolved from a registry. Drop it on any ACR-aware runtime and the agent boots with that persona's behavior, capability tree, tool permissions, and memory hooks.

See `examples/agent-persona/Kit.capability.yaml` in this repo — a complete, **schema-valid** persona manifest. It bundles Kit's behavioral core, an optional per-client tone overlay, an engineering capability tree, scoped permissions, and a memory hook. That file *is* the deliverable format for a Share client agent.

## The memory angle

Beaux's instinct that "ACR helps manage memory" is also correct, and it's a competitive advantage for the per-client model. There's a drafted spec (`engram-acr-integration.md`) where ACR's level-of-detail + budget + eviction system sits on top of Engram (the memory faculty). The payoff for Share: each client agent maintains **ambient awareness of hundreds of client-specific memories** (past conversations, brand decisions, commitments) at tiny token cost, promoting the few relevant ones to full detail per turn. Each client's memory is isolated per agent session. So a client agent doesn't just *act* bespoke — it *remembers* bespoke, within a controlled token budget.

(Status: that integration is specced, not yet built. The persona/capability composition above works against the shipped v1 schema today.)

## Honest gaps — what's mature vs. what's roadmap

To set expectations correctly for a production rollout:

| Capability | Status |
|---|---|
| Capability + capability-set composition | **Shipped** (v1 schema) |
| Per-capability behavioral `core` + overlays (personality) | **Shipped** |
| Scoped tool/data permissions per agent | **Shipped** |
| Portable, single-file persona manifests | **Shipped** (see Kit example) |
| First-class rich `persona` block (voice, humor calibration, relationship history as structured fields) | **Roadmap** — today persona is a free-text `core` string; richer structure is an additive schema bump, not a rewrite |
| ACR ↔ Engram memory integration | **Specced, not built** |
| Reference runtime + registry for resolving capability trees | **Partial** — core library + CLI exist; production registry/hosting is the gap to close for a real Share deployment |

## The natural evolution (Beaux's "evolve ACR to include personality")

Today persona lives inside `behavioral.core` as instructions. The clean next step is promoting persona to a **first-class top-level block** with structured fields (voice, tone parameters, relationship context, do/don't rules) instead of one free-text string. Because the schema uses `additionalProperties: false`, this is a deliberate, versioned change — but it's *additive*: existing manifests keep validating. This is the "ACR for personality the way ACR is for memory and capabilities" idea, and it's squarely in line with the existing architecture.

## Bottom line for Share

- A per-client agent = one composable YAML, not a forked codebase. **That's what makes 1-to-1 scale.**
- Personality is already expressible and per-client tunable via `behavioral` core + overlays, today.
- Memory management is the differentiator on the roadmap, already specced.
- The honest gap to a *production* rollout is the registry/runtime hosting layer, not the model itself.

ACR is the right foundation for what Trevan wants. The composition model is sound and shipped; the personality and memory depth are a roadmap that the architecture was clearly designed to grow into.
