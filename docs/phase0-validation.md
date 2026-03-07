# Phase 0 Validation Report

**Date:** 2026-03-06
**Skills converted:** 5

## Converted Capabilities

| Capability | Type | Provides | Requires | Has Deep? |
|-----------|------|----------|----------|-----------|
| code-review | Methodology (pure process) | code-review, code-audit | exec | No |
| engram-recall | API integration | memory-recall | exec, engram-api-credentials | No |
| linear | External tool + API | issue-tracking, project-mgmt | exec, linear-api-key | No |
| consult | Multi-agent orchestration | expert-consultation | sessions_spawn, subagents | No |
| nestjs | Framework patterns + refs | nestjs-development | exec | Yes (8 reference docs) |

## Budget Validation (128K context window)

| Capability | Index | Summary | Standard | Deep |
|-----------|-------|---------|----------|------|
| code-review | ~15 | ~92 | ~908 | — |
| engram-recall | ~16 | ~91 | ~551 | — |
| linear | ~18 | ~83 | ~618 | — |
| consult | ~15 | ~97 | ~782 | — |
| nestjs | ~15 | ~93 | ~340 | ~8304 |
| **All 5 at standard** | | | **~3199** | |
| **All 5 at summary** | | | | |
| Total summaries | | **~456** | | |

**Key finding:** All 5 capabilities at standard resolution = ~3200 tokens = **2.5% of a 128K window**. Even with 20 capabilities loaded, you'd use ~13K tokens. The LOD system works — there's massive headroom.

**nestjs deep** is the outlier at ~8300 tokens (8 full reference docs). This validates the "deep is burst allocation" principle — you'd never load all 5 at deep simultaneously, but one capability at deep + four at standard is trivially within budget.

## Format Observations

### What Worked
1. **Manifest captures everything needed** — provides, requires, budget, triggers, permissions, behavioral core, state schema, verification. No fields felt unnecessary.
2. **LOD levels are natural** — writing index (one-liner), summary (paragraph), standard (full instructions), and deep (instructions + examples + refs) felt intuitive. The standard.md = existing SKILL.md mapping is seamless.
3. **Provides tags are useful immediately** — even without formal interfaces, tags enable conflict detection and search.
4. **Activation triggers are practical** — regex patterns + runtime events cover real use cases. The `trigger_logic: OR/AND` field was needed.
5. **state_schema forced good thinking** — having to declare "what would I need to preserve if evicted?" clarified each capability's stateful nature.

### What Needs Adjustment
1. **Budget numbers should be measured, not guessed** — the declared budgets overestimate actual content. Phase 1's `acr budget` tool should measure actual token counts, not rely on author estimates.
2. **Tool bindings are too generic** — most capabilities just say `mcp: exec` because they use shell commands. Need to think about whether the ACR should model tool capabilities more granularly, or accept that `exec` is the universal adapter.
3. **Overlays had nothing to reference** — none of the 5 skills had overlays. This is expected (overlays come from team/org context, not individual capabilities), but the field felt vestigial until capability sets and roles are in play.
4. **deep.md authoring is heavy** — for nestjs, concatenating 8 reference docs into one file was mechanical. The migration tool should automate this.
5. **No test files yet** — the `tests/` directory in the package format has no defined format. Deferred correctly, but Phase 1 should define at minimum a smoke test format.

### Dependency Graph

```
consult
  └── engram-recall (optional, summary)
        └── [engram-api-credentials]

code-review
  └── [exec]

linear
  └── [exec, linear-api-key]

engram-recall
  └── [exec, engram-api-credentials]

nestjs
  └── [exec]
```

Only one cross-capability dependency: consult → engram-recall. The graph is shallow, which is expected for v0 capabilities. Deeper graphs will emerge with capability sets.

## Verdict

**The format holds.** The manifest captures real-world skill semantics without over-constraining. The LOD system produces natural resolution levels. Budget math works within real context windows. Migration from SKILL.md is trivial.

**Green light for Phase 1.**

## Next Steps
1. Tighten budget numbers based on actual tokenizer measurements
2. Build `acr validate` to check manifest schema
3. Build `acr migrate` to automate SKILL.md → capability conversion
4. Build `acr budget` to measure actual token costs
5. Convert 10 more skills to stress-test edge cases
