# Skill: engram-code (Code Search)

Semantic code search across indexed repositories via **engram-code** (localhost:3002).

## When to Use
- "Where is X implemented?"
- Finding code patterns, classes, methods, or architecture
- Understanding how a feature works across files
- Finding relevant code before making changes

## Quick Search

```bash
~/clawd/skills/engram-code/scripts/search.sh "natural language query"
```

Options:
```bash
# Filter by language
~/clawd/skills/engram-code/scripts/search.sh "query" --lang apex

# Filter by chunk type (class, method, function, component, trigger, test)
~/clawd/skills/engram-code/scripts/search.sh "query" --type method

# Change result count (default 5)
~/clawd/skills/engram-code/scripts/search.sh "query" --limit 10

# Ensemble search (better accuracy, uses multiple models)
~/clawd/skills/engram-code/scripts/search.sh "query" --ensemble
```

## Direct API Usage

### Semantic search
```bash
curl -s -X POST http://localhost:3002/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "CRUD security check", "limit": 5}'
```

### Ensemble search (multi-model, better for ambiguous queries)
```bash
curl -s -X POST http://localhost:3002/v1/search/ensemble \
  -H "Content-Type: application/json" \
  -d '{"query": "CRUD security check", "models": ["bge-base", "nomic"], "limit": 5}'
```

### With filters
```bash
curl -s -X POST http://localhost:3002/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "error handling", "language": "apex", "chunkType": "method", "limit": 10}'
```

### List projects
```bash
curl -s http://localhost:3002/v1/projects
```

### Re-index a project
```bash
curl -s -X POST http://localhost:3002/v1/projects/<id>/ingest
```

## Indexed Projects

| Project | ID | Languages |
|---|---|---|
| whalehawk-salesforce | 84f3b3f8-3932-468b-9ff8-d4f54f6bffac | apex, lwc, javascript |

## Parameters
- **query** — natural language description of what you're looking for
- **projectId** — UUID to scope to one project (optional)
- **language** — apex, lwc, javascript, typescript
- **chunkType** — class, method, function, component, trigger, test
- **limit** — 1-100 (default 10)

## Response
Returns chunks with: `filePath`, `lineStart`/`lineEnd`, `content`, `name`, `score`, `highlights`.
Use `filePath` + `lineStart` to read the actual file for full context.

## Tips
- Start broad, then narrow with filters
- Use ensemble for important/ambiguous queries
- After finding a chunk, read the full file for surrounding context
- Search for class names to find usages across the codebase
