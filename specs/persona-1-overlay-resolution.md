# Spec: Behavioral Overlay Resolution & Priority Merge

**Repo:** heybeaux/acr
**Base branch:** main
**Type:** Feature (core runtime)

## Problem

`behavioral.overlays` is defined in the schema (`packages/schema/src/capability.schema.json` `$defs/Overlay`) and typed (`packages/schema/src/types.ts` `Overlay`, `Behavioral.overlays`), but **no code in the runtime resolves or applies overlays.** Confirmed: the only references to "overlay" in `packages/core/src` are in `migrate.ts` (emits empty `overlays: []`) and `session-policy.ts` (unrelated doc comment). The loader and context-manager render `behavioral.core` only.

This blocks the per-client agent persona model: a shared persona `core` plus a per-client tone `overlay` cannot actually modify agent behavior today because overlays are silently ignored.

## Goal

Resolve each `behavioral.overlays[]` entry's `ref` to overlay text, then merge it onto `behavioral.core` in priority order (higher `priority` applied later = wins), wherever `behavioral.core` is currently rendered into agent context.

## Design

An overlay `ref` resolves to a markdown file co-located with the capability, named `overlays/<ref>.md` in the capability's directory (same dir that holds `index.md`/`summary.md`/etc). Resolution is filesystem-based, mirroring `LODLoader`'s existing resolution-file pattern.

Merge model — produce a single composed behavioral string:
```
<behavioral.core>

## Overlay: <ref-1>      (priority asc order)
<overlay-1 content>

## Overlay: <ref-2>
<overlay-2 content>
```
Overlays are concatenated in ascending `priority` order (default priority `0`), so higher-priority overlays appear later and visually/semantically override earlier ones. Ties broken by array order.

Optional overlays (`optional: true`) whose `ref` file is missing are skipped silently. Non-optional overlays whose file is missing throw `ACRError` with code `MANIFEST_INVALID` and a message naming the capability and missing ref.

## Files to change

### 1. `packages/core/src/loader.ts`
Add a public method to `LODLoader`:
```typescript
/**
 * Resolve and merge behavioral.core with its overlays for a capability.
 * Returns core unchanged if no overlays. Overlays resolved from
 * <capabilityDir>/overlays/<ref>.md, merged in ascending priority order.
 */
resolveBehavioral(name: string): string
```
Behavior:
- Look up `manifest = this.manifests.get(name)`. If absent, throw `Capability "<name>" not registered with loader` (match existing error style at loader.ts:84).
- If `!manifest.behavioral?.core`, return `manifest.description` (match existing fallback at loader.ts:107).
- If no overlays (undefined or empty), return `manifest.behavioral.core`.
- Otherwise: get `dir = this.paths.get(name)`. Sort overlays by `(priority ?? 0)` ascending, stable. For each overlay, read `join(dir, 'overlays', overlay.ref + '.md')`:
  - exists → append section `\n\n## Overlay: <ref>\n<content>`
  - missing + `optional` → skip
  - missing + not optional → throw `ACRError` `{ code: 'MANIFEST_INVALID', message: 'Capability "<name>" requires overlay "<ref>" but overlays/<ref>.md was not found' }`
- Return `core + joinedOverlaySections`.
- Use `existsSync`, `readFileSync`, `join` already imported in loader.ts.

Add an in-memory cache keyed by `name` (overlays don't change within a session); clear it in whatever `clearCache()`/equivalent already exists if present (check loader.ts for an existing cache-clear method and mirror it).

### 2. `packages/core/src/context-manager.ts`
The `generateContext()` method (context-manager.ts:456) currently pushes `entry.manifest.behavioral.core` directly (line 481-483).

`ContextManager` does not currently hold a `LODLoader` reference (generateContext is the disk-I/O-free path per its doc comment at line 453-454). To avoid forcing a loader dependency here, implement an **inline** equivalent merge in context-manager that does NOT read files — it merges only overlays that have inline content. BUT since overlays are ref-based (file-backed), the correct home for merge is the loader/AgentAPI path.

Therefore:
- Leave `context-manager.ts:generateContext()` rendering `behavioral.core` as-is (it stays the no-I/O fast path).
- Do the overlay merge in the **AgentAPI / LODLoader-backed context generation path** instead (see file 3). Add a one-line code comment at context-manager.ts:481 noting overlays are applied in the loader-backed path, not here.

### 3. `packages/core/src/agent-api.ts`
Find where AgentAPI generates context using the LODLoader (it calls `LODLoader.generateContext()` or `loader.load(...)` per the note at context-manager.ts:453). At the point where a capability's behavioral/standard content is assembled for the prompt, call `loader.resolveBehavioral(name)` and use its result in place of the raw `behavioral.core`. If AgentAPI builds context purely from LOD files (index/summary/standard md) and not from `behavioral.core`, then append `resolveBehavioral(name)` output as a dedicated "Behavioral" section for each mounted capability whose manifest has `behavioral.core`.

(Read agent-api.ts before implementing to confirm the exact assembly point. The invariant: every place an agent's prompt currently receives `behavioral.core`, it must instead receive `loader.resolveBehavioral(name)`.)

### 4. `packages/core/src/adapters/openclaw.ts`
Lines 276-282 fall back to `cap.manifest.behavioral.core`. If a `LODLoader` instance is reachable in this adapter (check the surrounding code/constructor), replace those two `behavioral.core` pushes with `loader.resolveBehavioral(cap.manifest.name)`. If no loader is reachable here, leave as-is and add a `// TODO(persona): apply overlays when loader is available` comment — do not introduce a new loader dependency into the adapter in this ticket.

## Tests (`packages/core/src/__tests__/overlay-resolution.test.ts` — match existing test file location/convention)

1. `resolveBehavioral` returns `core` unchanged when manifest has no overlays.
2. Single overlay: returns `core` + `## Overlay: <ref>` + content.
3. Two overlays with priorities 5 and 10: priority-10 content appears AFTER priority-5 content.
4. Two overlays same priority: applied in array order.
5. Default priority: an overlay with no `priority` is treated as 0 (applied before priority-1).
6. Optional overlay with missing file: skipped, no throw, core returned.
7. Non-optional overlay with missing file: throws ACRError with code `MANIFEST_INVALID`, message contains capability name and ref.
8. Unregistered capability name: throws.
9. No `behavioral.core`: returns `description`.

Use a temp dir fixture: write a manifest + `overlays/<ref>.md` files to a tmp capability dir, register with loader, assert. Mirror the fixture setup style of the existing loader tests.

## Acceptance criteria
- `pnpm -w build` (or repo's build cmd) passes — `tsc --noEmit` clean.
- All new tests pass; existing tests still pass.
- No change to public behavior when manifests have zero overlays (backward compatible).
- `Kit.capability.yaml`'s `client-tone-overlay` overlay, if a matching `overlays/client-tone-overlay.md` exists, is merged after the core.

## Out of scope
- The richer first-class `persona:` block (separate ticket).
- Registry/remote overlay resolution (filesystem only here).
