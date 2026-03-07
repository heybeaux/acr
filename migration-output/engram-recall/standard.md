---
name: engram-recall
description: Query Engram memory database for specific information. Use when you need to recall facts about the user, prior decisions, or preferences that may not be in your current injected context.
---

# Engram Recall Skill

Query the Engram memory database on-demand for specific information.

## When to Use

Use this skill when:
- Asked about specific facts not in your current context
- Uncertain about user preferences or prior decisions
- Need to verify something before acting
- Cross-referencing prior work or conversations

Do NOT use for:
- General conversation (bootstrap injection handles this)
- Every single question (expensive)
- Information you already have in context

## Quick Recall

```bash
# Basic query
curl -s -X POST "http://localhost:3001/v1/memories/query" \
  -H "Content-Type: application/json" \
  -H "X-AM-API-Key: engram_gv9r6c4vesomlekojvkne" \
  -H "X-AM-User-ID: Beaux" \
  -d '{"query": "YOUR SEARCH QUERY", "limit": 5}' | jq '.memories[] | {raw, layer, importance: .importanceScore}'
```

## Examples

### Find user preferences
```bash
curl -s -X POST "http://localhost:3001/v1/memories/query" \
  -H "Content-Type: application/json" \
  -H "X-AM-API-Key: engram_gv9r6c4vesomlekojvkne" \
  -H "X-AM-User-ID: Beaux" \
  -d '{"query": "coffee preference", "limit": 3}' | jq '.memories[].raw'
```

### Search for project context
```bash
curl -s -X POST "http://localhost:3001/v1/memories/query" \
  -H "Content-Type: application/json" \
  -H "X-AM-API-Key: engram_gv9r6c4vesomlekojvkne" \
  -H "X-AM-User-ID: Beaux" \
  -d '{"query": "UltraEdge monetization", "limit": 5, "layers": ["PROJECT"]}' | jq '.memories[].raw'
```

### Find identity/core facts
```bash
curl -s -X POST "http://localhost:3001/v1/memories/query" \
  -H "Content-Type: application/json" \
  -H "X-AM-API-Key: engram_gv9r6c4vesomlekojvkne" \
  -H "X-AM-User-ID: Beaux" \
  -d '{"query": "family members", "limit": 5, "layers": ["IDENTITY"]}' | jq '.memories[].raw'
```

## Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Natural language search query |
| `limit` | number | 10 | Max results to return |
| `layers` | array | all | Filter by layer: `IDENTITY`, `PROJECT`, `SESSION`, `TASK` |
| `includeChains` | boolean | false | Include reasoning chains |

## Response Format

```json
{
  "memories": [
    {
      "id": "clx123",
      "raw": "The actual memory text",
      "layer": "IDENTITY",
      "importanceScore": 0.85,
      "extraction": {
        "who": "...",
        "what": "...",
        "when": "...",
        "topics": ["..."]
      }
    }
  ],
  "queryTokens": 4,
  "latencyMs": 142
}
```

## Environment

The skill uses these environment variables (configured in OpenClaw hooks):
- `ENGRAM_API_URL`: http://localhost:3001
- `ENGRAM_API_KEY`: engram_gv9r6c4vesomlekojvkne
- `ENGRAM_USER_ID`: Beaux

## Tips

1. **Be specific** — "Beaux's coffee preference" better than "coffee"
2. **Use layers** — Filter to IDENTITY for core facts, PROJECT for work context
3. **Low limit first** — Start with limit=3, increase if needed
4. **Mark as used** — After using a memory, call POST `/v1/memories/:id/used`
