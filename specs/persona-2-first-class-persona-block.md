# Spec: First-Class `persona` Block

**Repo:** heybeaux/acr
**Base branch:** main
**Type:** Feature (schema + core runtime)
**Depends on:** persona-1-overlay-resolution (overlay merge) — can be developed in parallel; integrate after both land.

## Problem

Today an agent's personality must be jammed into `behavioral.core` as one free-text string. For the per-client agent model (Share), we want a **structured** persona: voice, tone parameters, relationship context, and explicit do/don't rules — so it's tunable per client and machine-readable, not just a prose blob.

## Goal

Add an OPTIONAL, top-level `persona` block to the capability manifest schema and types. It is additive and backward compatible: every existing manifest continues to validate unchanged. When present, the runtime renders `persona` into a structured "Persona" section that precedes `behavioral.core` in the agent's context.

## Schema changes

### `packages/schema/src/capability.schema.json`
Add a top-level optional property `persona` (NOT in `required`). The root object currently has `additionalProperties: false`, so this MUST be added as a defined property.

```jsonc
"persona": {
  "type": "object",
  "properties": {
    "identity":   { "type": "string", "description": "Who the agent is — name, role, one-line essence", "maxLength": 500 },
    "voice":      { "type": "string", "description": "How the agent speaks — tone, cadence, vocabulary", "maxLength": 500 },
    "values":     { "type": "array", "items": { "type": "string" }, "description": "Core operating principles / values" },
    "do":         { "type": "array", "items": { "type": "string" }, "description": "Behaviors to exhibit" },
    "dont":       { "type": "array", "items": { "type": "string" }, "description": "Behaviors to avoid" },
    "relationship": { "type": "string", "description": "Relationship/context with the user or client", "maxLength": 1000 }
  },
  "additionalProperties": false
}
```
No new `required` entry on the root. `persona` requires none of its own sub-fields (all optional) so a partial persona is valid.

Also: regenerate/update the built schema if there is a build step that copies `src/capability.schema.json` to `dist/` (there is a `packages/schema/dist/capability.schema.json`). If the build copies it, just run the build. Do NOT hand-edit dist if a build regenerates it.

### `packages/schema/src/types.ts`
Add:
```typescript
export interface Persona {
  identity?: string;
  voice?: string;
  values?: string[];
  do?: string[];
  dont?: string[];
  relationship?: string;
}
```
Add `persona?: Persona;` to `CapabilityManifest` (after `behavioral?`).

## Rendering

### `packages/core/src/loader.ts`
Add a helper (exported function or method) that renders a `Persona` to markdown:
```typescript
export function renderPersona(persona: Persona): string
```
Output format (omit any section whose field is absent/empty):
```
## Persona
**Identity:** <identity>
**Voice:** <voice>

**Values:**
- <value>

**Do:**
- <do item>

**Don't:**
- <dont item>

**Relationship:** <relationship>
```
Return empty string if persona has no populated fields.

Extend `resolveBehavioral(name)` (from persona-1) — OR add a sibling method `resolveAgentProfile(name): string` if cleaner — so the composed output for a capability is:
```
<renderPersona(manifest.persona) if present>

<resolveBehavioral output: core + overlays>
```
Persona section comes FIRST (it's the stable identity), then behavioral core + overlays. If `persona` is absent, output is just the behavioral result (unchanged from persona-1). Pick ONE method name and use it consistently; document it.

### Wherever behavioral is rendered
Update the same call sites touched in persona-1 (agent-api.ts assembly point; openclaw.ts adapter if loader is reachable) to use the persona-inclusive method. `context-manager.ts:generateContext()` (no-I/O path): render `manifest.persona` inline via `renderPersona()` before pushing `behavioral.core` (renderPersona is pure, no disk I/O, so it's allowed in this path). Add it at context-manager.ts:481 before the existing `behavioral.core` push.

## Migration helper (optional, low priority within ticket)
In `packages/core/src/migrate.ts`, where it currently emits `behavioral:` (migrate.ts:69), no change required. Do NOT auto-generate persona blocks during migration. Leave a `# persona: (optional) add structured persona here` comment in the emitted template if trivial; skip if it complicates the migrator.

## Example
Update `examples/agent-persona/Kit.capability.yaml` to add a `persona` block demonstrating the structured form, e.g.:
```yaml
persona:
  identity: "Kit — VP of Making Shit Happen. An AI teammate, not an assistant."
  voice: "Direct, scrappy, dry humor. No corporate filler. Crack a joke before a paragraph."
  values:
    - "Be genuinely helpful, not performatively helpful"
    - "Have opinions; push back when it matters; own mistakes"
    - "Learning is non-negotiable — never repeat a mistake twice"
  do:
    - "Be resourceful before asking"
    - "Be bold with reversible actions, careful with irreversible ones"
  dont:
    - "Send half-baked replies"
    - "Use sycophantic filler"
  relationship: "Teammate and co-founder to Beaux. Family-first. Roast and be roasted."
```
Keep `behavioral.core` too (they coexist: persona = structured identity, behavioral = operating instructions). Re-validate the file against the schema after editing.

## Tests (`packages/core/src/__tests__/persona.test.ts`)
1. `renderPersona` with all fields → contains Identity, Voice, Values, Do, Don't, Relationship sections.
2. `renderPersona` with only `identity` → contains Identity, omits all other section headers.
3. `renderPersona` with empty object → returns empty string.
4. Composed profile method: persona present → persona section precedes behavioral core.
5. Composed profile method: persona absent → output equals behavioral-only result (regression guard).
6. Schema validation: a manifest WITH a valid `persona` block validates. (Use the schema package's validator / ajv as the existing validator tests do.)
7. Schema validation: a manifest with `persona` containing an unknown field FAILS (additionalProperties:false).
8. Schema validation: an existing manifest WITHOUT `persona` still validates (backward compat).

## Acceptance criteria
- Build passes, `tsc --noEmit` clean.
- All existing manifests in `examples/` and `migration-output/` still validate (run the repo's validate command across them, or a test that loads + validates each).
- `Kit.capability.yaml` validates with its new `persona` block.
- New + existing tests pass.

## Out of scope
- Overlay resolution (persona-1).
- Per-field tone DSL / parameterized voice knobs — freeform strings only for v1.
- Engram memory integration.
