# Engram Memory Skill

Semantic memory middleware for OpenClaw. Automatically captures conversation turns and injects relevant memory context into prompts.

## What It Does

- **Auto-capture**: Every conversation turn is sent to Engram for embedding and storage
- **Context injection**: Relevant memories are retrieved and injected into system prompts
- **Transparent middleware**: Works silently without explicit calls

## Configuration

Add to your `openclaw.yaml`:

```yaml
skills:
  engram:
    enabled: true
    apiUrl: "http://localhost:3001"  # Engram API endpoint
    apiKey: ""                        # Optional API key
    autoCapture: true                 # Auto-capture conversation turns
    injectContext: true               # Inject memory context into prompts
    maxContextTokens: 2000            # Max tokens for injected context
    captureRole: "both"               # Which turns to capture: "user", "assistant", "both"
    minCaptureLength: 20              # Skip capturing very short messages
```

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/memories` | Create new memory entries |
| `POST /v1/observe` | Auto-mode capture (if available) |
| `POST /v1/context` | Load relevant context for a query |

## How It Works

### Capture Flow
```
User message → OpenClaw → [Engram captures turn] → Response
                              ↓
                    POST /v1/observe or /v1/memories
```

### Context Injection Flow
```
User message → [Engram loads context] → Injected into system prompt → LLM
                       ↓
              POST /v1/context
```

## Manual Commands

Even with auto-capture enabled, you can manually interact:

- **Remember this**: "Remember that the project deadline is Feb 15th"
- **Recall**: "What do you remember about the project deadline?"
- **Forget**: "Forget about [topic]" (if Engram supports deletion)

## Environment Variables

Alternative to yaml config:

```bash
export ENGRAM_API_URL="http://localhost:3001"
export ENGRAM_API_KEY="your-key-here"
```

## Troubleshooting

### Engram not responding
```bash
# Check if Engram is running
curl http://localhost:3001/health
```

### Context not injecting
- Verify `injectContext: true` in config
- Check Engram has indexed memories (`maxContextTokens` > 0)
- Ensure the query is semantically relevant to stored memories

### Capturing too much noise
- Increase `minCaptureLength` to skip short messages
- Set `captureRole: "user"` to only capture user messages

## Privacy Notes

- All conversation data flows through your local Engram instance
- No data leaves your machine unless Engram is configured for remote storage
- Memories persist across sessions — clear Engram's database to reset

## Integration Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     OpenClaw                             │
│  ┌─────────┐    ┌──────────────┐    ┌───────────────┐   │
│  │  User   │───▶│ Engram Skill │───▶│ LLM Provider  │   │
│  │ Message │    │ (middleware) │    │               │   │
│  └─────────┘    └──────┬───────┘    └───────────────┘   │
│                        │                                 │
└────────────────────────┼─────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Engram Server     │
              │  localhost:3001     │
              │  ┌───────────────┐  │
              │  │ Vector Store  │  │
              │  │ (memories)    │  │
              │  └───────────────┘  │
              └─────────────────────┘
```
