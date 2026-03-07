# CLI Reference

## `acr validate`

Validate a capability manifest and file structure.

```bash
# Validate a single capability
acr validate ./my-capability

# Validate all capabilities in a directory
acr validate --all ./capabilities
```

**Output:**
```
✅ my-capability
❌ broken-capability — 2 errors
   capability.yaml/name: Pattern mismatch
   💡 Check the naming convention — use lowercase with hyphens
   standard.md: Required file missing
   💡 Create standard.md — run `acr migrate` to auto-generate
```

**Exit codes:** 0 = valid, 1 = errors found

**With `--all`**, also detects legacy skills:
```
⚠️ old-skill — legacy skill (no capability.yaml). Run: acr migrate old-skill/SKILL.md
```

---

## `acr migrate`

Generate an ACR capability from an existing skill file.

```bash
# Basic migration
acr migrate ./skills/linear/SKILL.md

# Preview without writing
acr migrate ./SKILL.md --dry-run

# Custom output directory
acr migrate ./SKILL.md --output-dir ./capabilities/my-skill
```

**Generates:**
- `capability.yaml` — Manifest scaffold with TODOs
- `index.txt` — Auto-generated from description
- `summary.md` — Auto-generated summary
- `standard.md` — Copy of original SKILL.md

---

## `acr budget`

Calculate context budget for capabilities, sets, or roles.

```bash
# Single capability
acr budget ./my-capability

# Directory of capabilities
acr budget ./capabilities

# Custom window size
acr budget ./capabilities --window 200000

# Machine-readable output
acr budget ./capabilities --format json
```

**Output:**
```
📊 Budget Report (window: 128,000 tokens)

  code-review        standard     1400 tok  █ 1.1%
  engram-recall      standard      900 tok  █ 0.7%
  linear             standard     1000 tok  █ 0.8%

  Total                           3300 tok       2.6% of window

🔥 Burst Analysis (what if a capability escalates to deep?):
  code-review: +1800 tok → 5100 tok ✅ FITS
```

---

## `acr resolve`

Show the full dependency resolution plan.

```bash
# Resolve a directory of capabilities
acr resolve ./capabilities

# Custom window size
acr resolve ./capabilities --window 64000

# Machine-readable
acr resolve ./capabilities --format json
```

**Output:**
```
🔗 Resolution Plan

   0. git-basics [standard] (800 tok)
   1. engram-recall [summary] (200 tok)
   2. github-pr-review [standard] (1800 tok) → depends on: git-basics
   3. consult [standard] (1200 tok) → depends on: engram-recall

⚠️ Conflicts:
  github-pr-review ↔ gitlab-mr-review (shared: code-review)

  Total: 4000 tokens (3.1% of 128,000 window)
```

---

## Global Options

| Option | Description |
|--------|-------------|
| `--window <tokens>` | Context window size (default: 128000) |
| `--format <tree\|json>` | Output format |
| `--help`, `-h` | Show help |
