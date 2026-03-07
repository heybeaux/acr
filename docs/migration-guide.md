# Migration Guide

How to convert existing agent skills to ACR capabilities.

## Automatic Migration

The fastest path — use `acr migrate`:

```bash
acr migrate ./my-skill/SKILL.md
```

This generates:
- `capability.yaml` — Manifest with TODOs to fill in
- `index.txt` — Auto-generated from description
- `summary.md` — Auto-generated summary
- `standard.md` — Your original SKILL.md (unchanged)

### Options

```bash
# Preview without writing files
acr migrate ./SKILL.md --dry-run

# Specify output directory
acr migrate ./SKILL.md --output-dir ./capabilities/my-skill
```

### After Migration

1. **Review `capability.yaml`** — Fill in the TODO sections:
   - `provides` tags (what does this capability offer?)
   - `requires.tools` (what MCP servers does it need?)
   - `behavioral.core` (extract the essence from standard.md)

2. **Validate**:
   ```bash
   acr validate ./my-skill
   ```

3. **Check budget**:
   ```bash
   acr budget ./my-skill
   ```

## Manual Migration

For more control, convert by hand:

### Step 1: Create the Directory

```
my-capability/
├── capability.yaml
├── index.txt
├── summary.md
├── standard.md
└── deep.md          (optional)
```

### Step 2: Map Your Content

| Source | Destination |
|--------|------------|
| SKILL.md | `standard.md` |
| First line / description | `index.txt` |
| Key sections summary | `summary.md` |
| SKILL.md + reference docs | `deep.md` |

### Step 3: Write the Manifest

See [Manifest Reference](manifest-reference.md) for all fields.

The minimum viable manifest:

```yaml
name: my-capability
type: capability
version: 1.0.0
description: "What this does"
provides: [my-capability]
budget:
  index: 12
  summary: 150
  standard: 1000
behavioral:
  core: |
    Core instructions here.
```

## Framework-Specific Mapping

### OpenClaw Skills
```
SKILL.md → standard.md
Frontmatter name/description → manifest name/description
```

### Cursor Rules (.cursorrules)
```
.cursorrules → behavioral.core + overlays
Project-specific rules → overlays with priority
```

### Claude Project Instructions
```
Project instructions → Role policy + capability cores
Custom instructions → behavioral.core
```

### MCP Server Configs
```
MCP server config → requires.tools entries
Tool descriptions → Part of behavioral.core
```

## Backward Compatibility

Skills without a `capability.yaml` still work. The ACR runtime treats them as single-resolution capabilities with sensible defaults:

- Name inferred from directory name
- `provides` = [directory-name]
- Budget = actual token count of SKILL.md
- No dependency resolution, budget management, or permission scoping

Legacy skills generate a deprecation warning:
```
⚠️ my-skill — legacy skill (no capability.yaml). Run: acr migrate ./my-skill/SKILL.md
```

## Tips

- **Start with `acr migrate`** — even a rough scaffold is better than starting from scratch
- **Budget numbers matter** — measure with a tokenizer, don't guess
- **`provides` tags are your API** — choose them carefully, they're used for conflict detection
- **Write `index.txt` last** — it's easier when you know what the capability does
- **`deep.md` is optional** — only create it if you have reference docs or examples worth including
