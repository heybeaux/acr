# Getting Started with ACR

Create your first agent capability in 5 minutes.

## What is a Capability?

A capability is a self-contained bundle of behavioral instructions, tool bindings, and context for an AI agent. Think of it as `package.json` for agent skills — it declares what the capability provides, what it needs, and how much context it uses.

## Prerequisites

```bash
npm install -g @agentcapabilityruntime/cli
```

## Step 1: Create Your Capability Directory

```bash
mkdir my-capability
cd my-capability
```

## Step 2: Write the Manifest

Create `capability.yaml`:

```yaml
name: my-capability
type: capability
version: 1.0.0
description: "A short description of what this capability does"

provides:
  - my-capability

requires:
  tools: []
  capabilities: []

budget:
  index: 12
  summary: 150
  standard: 1000

activation:
  triggers:
    - type: pattern
      match: "my capability"
  trigger_logic: OR

behavioral:
  core: |
    Instructions for the agent when this capability is active.
    Be specific and actionable.
```

## Step 3: Write the Resolution Files

**index.txt** (~15 tokens, one line):
```
my-capability: Short description of what this does.
```

**summary.md** (~200 tokens):
```markdown
# my-capability

Expanded description with key capabilities, triggers, and requirements.

**Provides:** my-capability
**Requires:** none
**Triggers:** "my capability"
```

**standard.md** (~2K tokens):
Your full instructions. This is what the agent sees when this capability is actively in use.

**deep.md** (optional, ~5K tokens):
Everything in standard.md plus examples, reference docs, and edge cases.

## Step 4: Validate

```bash
acr validate .
# ✅ Valid: ./my-capability
```

## Step 5: Check Budget

```bash
acr budget .
# 📊 Budget Report (window: 128,000 tokens)
#   my-capability  standard  1000 tok  █ 0.8%
```

## Migrating Existing Skills

Already have a SKILL.md? Convert it automatically:

```bash
acr migrate ./path/to/SKILL.md
```

This generates a capability directory with:
- `capability.yaml` — manifest (review the TODOs)
- `index.txt` — auto-generated
- `summary.md` — auto-generated
- `standard.md` — your original SKILL.md

## Next Steps

- [Manifest Reference](manifest-reference.md) — all fields explained
- [Migration Guide](migration-guide.md) — converting existing skills
- [CLI Reference](cli-reference.md) — all commands
