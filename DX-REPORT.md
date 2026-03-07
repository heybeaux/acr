# ACR Dogfooding Report — Kit 🦊
**Date:** 2026-03-07
**Tester:** Kit (OpenClaw Telegram agent)
**Perspective:** End-user agent consuming capabilities

---

## Setup Experience

### Install & Build ✅
- `git clone` → `npm install` → `npm run build` — clean, zero issues
- Build order (schema → core → cli) handled by workspace scripts
- 88/88 tests passing out of the box
- **Time from clone to working CLI: ~30 seconds**

### CLI Discovery ✅
- `acr --help` is clean and complete
- Commands are intuitive: migrate, validate, lint, budget, search, resolve
- Good example suggestions in help text

---

## Migration Experience (SKILL.md → ACR Capability)

### What I Migrated
8 skills from my live environment: factory, github, coding-agent, weather, discord, summarize, engram-recall, consult

### What Went Well
- **`acr migrate` works** — every SKILL.md converted without errors
- **Auto-generated index.txt** is good — truncated description, enough for cold-start awareness
- **Auto-generated summary.md** captures the key points
- **standard.md preserves original content** — no data loss
- **Budget calculation is instant and clear** — the bar chart output is 👨‍🍳💋
- **Validation catches real issues** — clean pass on all migrated capabilities

### Token Budget Reality Check
| Scenario | Tokens | % of 128K Window |
|----------|--------|-------------------|
| 8 skills at index (cold start) | ~160 | 0.1% |
| 8 skills all at standard (current behavior) | 8,382 | 6.5% |
| 3 active at standard + 5 at index | ~2,800 | 2.2% |
| Typical session (1 deep + 2 standard + 5 index) | ~4,500 | 3.5% |

Current OpenClaw injects ALL matched skills at full resolution. ACR at index-only is **~50x cheaper** at cold start.

### What Needs Work

#### 1. TODOs in Generated Manifest (Medium Priority)
The migrated `capability.yaml` has a LOT of TODOs:
- `provides:` only gets the skill name, no semantic tags
- `requires.tools:` is empty — doesn't parse tool references from SKILL.md
- `behavioral.core:` just says "See standard.md" — doesn't extract the essence
- `triggers:` only gets the skill name as a pattern — misses the rich matching from the original description

**Suggestion:** The migrator could parse the SKILL.md description field for trigger hints. E.g., "Use when: (1) user says /factory" → pattern trigger for `/factory`. The `NOT for:` sections could generate `conflicts:` entries.

#### 2. No Deep LOD Generated (Low Priority)
Migration creates index → summary → standard but never deep. For capabilities like `coding-agent` (2539 tokens at standard), a deep level with full reference docs would be valuable.

**Suggestion:** If the SKILL.md references external files or has sections >1000 tokens, suggest creating a deep.md.

#### 3. Trigger Patterns Are Too Simple (High Priority)
The auto-generated triggers are just the skill name as a regex. My `factory` skill should trigger on `/factory`, "run the factory", "process tickets", "batch processing", etc. The `github` skill should trigger on "PR", "pull request", "CI", "issue", "commit", not just "github".

**Suggestion:** Extract trigger patterns from the description's "Use when:" clauses. Even a naive keyword extraction would be 10x better than just the skill name.

#### 4. No Dependency Detection (Medium Priority)
The `factory` skill depends on `github` (for PRs) and `coding-agent` (for workers). The migrator doesn't detect this from content analysis.

**Not blocking** — humans can fill this in. But would be nice for v2.

#### 5. Index Truncation (Cosmetic)
Index text gets truncated with `...` mid-word sometimes. E.g.: `"querie..."` instead of `"queries..."`. Should truncate at word boundaries.

---

## CLI Feedback

### `acr validate` ✅
- Fast, clear output
- Would be nice to see: `acr validate --all ./migrated` (batch validation)
  - **UPDATE:** This already works with `--all`! Didn't see it at first because it's documented as a flag, not a subcommand. Maybe `acr validate-all <dir>` as an alias?

### `acr lint` ✅
- Good that it suggests section structure (Overview, Commands/Patterns, Examples)
- Info-level suggestions feel right — not blocking, just helpful

### `acr budget` 🏆
- This is the killer feature of the CLI. The visual bar chart makes token costs tangible.
- **Suggestion:** Add a comparison mode: `acr budget ./migrated --compare-flat` showing "with ACR vs. without ACR" side by side
- **Suggestion:** Add `--level index|summary|standard|deep` to show budget at different LOD levels

### `acr search` (not tested yet)
- Need more capabilities to make this useful

### `acr resolve` (not tested yet)
- Need dependency chains to test

---

## Factory Integration Ideas

The Factory is the highest-impact integration point. Currently, workers get a giant `.factory-prompt.md` dumped into their context. ACR could:

1. **Conductor resolves capabilities per-ticket** — a NestJS ticket gets `nestjs:deep + prisma:standard + testing:summary`. A frontend ticket gets `react:deep + tailwind:standard`. No wasted context on irrelevant skills.

2. **Worker context budget enforcement** — set a 50K token cap per worker, let ACR pack the most relevant capabilities within budget.

3. **Capability-as-spec enrichment** — the `behavioral.core` field could provide coding standards that supplement the ticket spec. Instead of repeating "use dependency injection" in every spec, it lives in the `nestjs` capability.

4. **Verification checklists** — each capability's `verification.checklist` gives workers built-in quality gates beyond just "does it build."

---

## Overall Assessment

**ACR is ready for dogfooding.** The core loop works: migrate → validate → budget → use. The migration path is the right entry point — it meets existing skill authors where they are.

**Biggest gap:** The migrator produces a solid scaffold but the auto-generated content needs manual enrichment. The TODOs are all reasonable, but there are ~6 per manifest. For a user with 30+ skills, that's 180+ manual edits.

**Recommendation:** Focus the next iteration on smarter migration (better trigger extraction, dependency detection, semantic `provides` tags). The runtime is solid — the authoring DX is where the friction lives.

**Would I use this today?** Yes, with the understanding that I'd spend 15-20 minutes enriching each migrated capability. The payoff (98% cold-start token reduction) is worth it.

---

## Post-Enrichment Notes

After enriching all 8 capabilities with real triggers, provides, behavioral.core, and dependencies:

**Validator caught 3 real bugs in my hand-authored YAML:**
- Used `ref:` instead of `name:` for capability dependencies (schema says `name`)
- Used `read` instead of `read-only` for data permissions (enum validation)
- Both were clear error messages with fix suggestions — great DX

**Enrichment time:** ~15 minutes for 8 capabilities. Most time spent reading standard.md and distilling behavioral.core. A skilled author could do 4-5 per hour.

**Final validation:** 8/8 valid, 0 errors, 0 warnings.

---

*Report by Kit 🦊 — VP of Making Shit Happen*
