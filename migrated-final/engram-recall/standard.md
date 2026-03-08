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
- Every single question (expensive)
- Information you already have in context

**ALWAYS use when:**
- Asked about personal preferences, favorites, facts about the user or their family
- Asked "do you remember..." or "what's my..."
- Uncertain about ANY factual claim about the user
- The answer isn't already in your injected workspace files

## Quick Recall

```bash
# Local instance (preferred — 7k+ memories, faster)
curl -s -X POST "http://localhost:3002/v1/memories/query" \
  -H "Content-Type: application/json" \
  -H "X-AM-User-ID: beaux" \
  -d '{"query": "YOUR SEARCH QUERY", "limit": 5}' | jq '.memories[] | {raw, layer, importance: .importanceScore}'
```

```bash
# Cloud fallback
curl -s -X POST "https://api.openengram.ai/v1/memories/query" \
  -H "Content-Type: application/json" \
  -H "X-AM-API-Key: eng_3303a13b6070a90cf7494ff68169912e3b087af76e505fef" \
  -H "X-AM-User-ID: Beaux" \
  -d '{"query": "YOUR SEARCH QUERY", "limit": 5}' | jq '.memories[] | {raw, layer, importance: .importanceScore}'
```

## Examples

### Find user preferences
```bash
curl -s -X POST "http://localhost:3002/v1/memories/query" \
  -H "Content-Type: application/json" \
  -H "X-AM-User-ID: beaux" \
  -d '{"query": "coffee preference", "limit": 3}' | jq '.memories[].raw'
```

### Search for project context
```bash
curl -s -X POST "http://localhost:3002/v1/memories/query" \
  -H "Content-Type: application/json" \
  -H "X-AM-User-ID: beaux" \
  -d '{"query": "UltraEdge monetization", "limit": 5, "layers": ["PROJECT"]}' | jq '.memories[].raw'
```

## Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Natural language search query |
| `limit` | number | 10 | Max results to return |
| `layers` | array | all | Filter by layer: IDENTITY, PROJECT, SESSION, TASK |
| `includeChains` | boolean | false | Include reasoning chains |

## Store a Memory

```bash
# Local instance
curl -s -X POST "http://localhost:3002/v1/memories" \
  -H "Content-Type: application/json" \
  -H "X-AM-User-ID: beaux" \
  -H "X-AM-Agent-ID: kit" \
  -d '{"content": "MEMORY_CONTENT", "type": "observation", "agentId": "kit"}'
```

## Environment

- **Local API URL**: http://localhost:3002 (preferred, 7k+ memories)
- **Local User ID**: beaux (lowercase)
- **Cloud API URL**: https://api.openengram.ai
- **Cloud API Key**: eng_3303a13b6070a90cf7494ff68169912e3b087af76e505fef
- **Cloud User ID**: Beaux (capitalized)
- **Agent ID**: kit

**Always try local first. Fall back to cloud if local is unreachable.**

## Tips

1. **Be specific** — "Beaux's coffee preference" better than "coffee"
2. **Use layers** — Filter to IDENTITY for core facts, PROJECT for work context
3. **Low limit first** — Start with limit=3, increase if needed
4. **Mark as used** — After using a memory, call POST `/v1/memories/:id/used`
