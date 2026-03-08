---
name: consult
description: "Multi-model expert panel consultation. Use when: (1) stuck on a problem for 20+ minutes, (2) architecture or pricing decisions with irreversible consequences, (3) user says /consult, (4) genuine blind spot identified. Spawns parallel sub-agents across different models (Gemini, GPT, etc.), collects independent perspectives, and synthesizes into a recommendation. NOT for: routine tasks, obvious answers, or time-critical situations where speed > thoroughness."
---

# Expert Panel Consultation

Spawn parallel sub-agents across multiple models, collect independent perspectives, synthesize into a recommendation.

## Quick Start

When triggered (user says `/consult` or you identify a genuine need):

1. Frame the problem as a brief (see template below)
2. Spawn sub-agents in parallel — one per model
3. Wait for all responses (timeout: 3 min)
4. Synthesize into a structured recommendation
5. Store key insights in Engram (if available)

## Default Panel

| Model | Alias | Strengths |
|-------|-------|-----------|
| `google/gemini-2.5-pro` | Gemini 🔵 | Research synthesis, challenges assumptions |
| `openai/gpt-5` | GPT ⚡ | Edge case detection, structured decomposition |

Override with `--models`: `/consult --models opus,gemini-2.5-pro,gpt-5`

Model alias map (extend as needed):
- `gemini` → `google/gemini-2.5-pro`
- `gpt` → `openai/gpt-5`
- `opus` → `anthropic/claude-opus-4-6`
- `sonnet` → `anthropic/claude-sonnet-4-6`

## Workflow

### 1. Frame the Brief

```markdown
## Context
[What we're building, what constraint or decision we hit]

## What we've tried / considered
[Options explored, why they didn't work]

## The question
[Single, specific question to answer]

## Constraints
[Hard limits: budget, timeline, ToS, technical stack]

## Decision criteria
[What makes one answer better than another]
```

Strip ALL sensitive data before sending: no API keys, credentials, private user data, client info, or Engram memories. The brief must be self-contained — panel models have no tool access.

### 2. Spawn Panel

Use `sessions_spawn` for each model in parallel:

```
sessions_spawn(
  task: "<sanitized brief>",
  model: "<model>",
  mode: "run",
  runtime: "subagent",
  label: "panel-<model-short>",
  runTimeoutSeconds: 180
)
```

Fire all spawns in a single tool call block (no dependencies between them).

### 3. Collect Responses

Sub-agents auto-announce completion. If a model times out after 3 minutes, proceed without it and note the gap.

### 4. Synthesize

Produce a synthesis using this structure:

```markdown
## Panel Synthesis — [topic]

**Panel:** [models consulted]

### Agreement
- [Points all models agreed on — high confidence]

### Disagreement
- **Model A:** [position]
- **Model B:** [position]
- **Why it matters:** [implication of choosing one over the other]

### New angles
- [Ideas not previously considered]

### Recommendation
[Clear recommended action with reasoning]

### Confidence: High / Medium / Low
[Why this confidence level]

### Escalate to Beaux? Yes / No
[Yes if: contradictory with no clear winner, irreversible, or touches money]
```

### 5. Store (if Engram available)

```bash
curl -s -X POST "https://api.openengram.ai/v1/memories" \
  -H "Content-Type: application/json" \
  -H "X-AM-API-Key: <key>" \
  -H "X-AM-User-ID: <user>" \
  -d '{
    "content": "<1-paragraph synthesis summary>",
    "type": "episodic",
    "layer": "INSIGHT",
    "source": "AGENT_OBSERVATION",
    "tags": ["panel:consultation", "panel:models:<model-list>"],
    "metadata": { "label": "panel-consultation" }
  }'
```

## Guardrails

- Panel models are **advisory only** — synthesizer (you) makes the recommendation, human makes the call
- Never send credentials, API keys, private data, or client info to panel models
- If responses are contradictory with no clear winner → escalate to Beaux
- Daily cost target: ~$5 max (~6-15 consultations depending on brief length)
- Round 2 adversarial debate (showing models each other's responses) is a future addition — don't do it yet

## Parsing /consult Commands

`/consult <topic>` — use default panel (Gemini + GPT)
`/consult --models opus,gpt <topic>` — custom panel
`/consult --quick <topic>` — single model only (cheapest: Gemini Flash)

If the user just says `/consult` with no topic, ask what problem they want the panel's perspective on.
