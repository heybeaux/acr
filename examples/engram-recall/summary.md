# engram-recall

On-demand query of the Engram memory database for specific facts not in current context. Searches across memory layers (IDENTITY, PROJECT, SESSION, TASK) with natural language queries. Returns ranked results with importance scores.

**Provides:** memory-recall, context-retrieval
**Requires:** exec (curl for API calls), engram-api-credentials
**Triggers:** "remember", "recall", "check memory/engram", preference lookups

Use sparingly — only when current context lacks needed information. Be specific with queries, filter by layer, keep limits low.
