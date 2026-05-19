# ACR (Agent Capability Runtime)

**Purpose:** Manage what goes into an AI agent's context window — which capabilities are loaded, at what resolution, within what budget. Agents have many tools but can't laid them all on the workbench at once. ACR keeps capabilities at *index* level (~15 tokens each, just-aware), promotes to *summary* / *standard* / *deep* as the task demands, then demotes back when done. Spec-grade framework with TypeScript reference implementation. Powers the heybeaux territory map.
**Repo:** https://github.com/heybeaux/acr
**Status:** active
**Phase:** v1.0-rc1 spec; 105 tests passing (per latest README)
**Last verified:** 2026-05-18

## Runtime

- **Local path:** /Users/beauxwalton/projects/acr (or `/tmp/acr` for ephemeral inspection)
- **Tech:** TypeScript (5.0+), npm workspaces, vitest
- **Packages:**
  - `@agentcapabilityruntime/core` — LODLoader, TaskResolver, ContextManager
  - `@agentcapabilityruntime/schema` — capability.yaml validation
  - `@agentcapabilityruntime/cli` — `acr migrate`, `acr validate`, `acr budget`, `acr lint`, `acr search`
- **Capability layout:** each capability is a directory with `capability.yaml` + four LOD files (`index.txt`, `summary.md`, `standard.md`, `deep.md`).

## Dependencies

- **Depends on:** none (it's the substrate)
- **Used by:** OpenClaw runtime (TaskResolver for worker spawning), territory map (this repo), every future capability-aware harness
- **External:** none

## Key contacts

- **Owner:** @beauxwalton
- **Recent contributors:** @beauxwalton

## Quick gotchas

- **Project-card budget convention:** territory uses `summary: 200` (not ACR's default 95) because project context needs ~2× a tool-card description.
- **LOD level isn't a quality gradient** — it's a relevance/specificity gradient. Loading at deep when summary is enough wastes budget.
- **Migration tool exists:** `acr migrate ./skills/foo/SKILL.md` converts legacy single-file skills into the 4-LOD structure.
- **CLI commands worth knowing:** `acr validate` (schema check), `acr budget` (cost analysis), `acr lint --all` (content quality), `acr search "database" ./capabilities/` (semantic find).
- **Examples and migrated-final** dirs in the repo are reference content; `examples/engram-recall` is a clean reference for a memory-recall style capability.

## Where to learn more

- `deep.md` — LOD semantics, trigger evaluation, registry protocol
- ACR README: https://github.com/heybeaux/acr/blob/main/README.md
- Spec: `specs/agent-capability-runtime.md` in the repo
