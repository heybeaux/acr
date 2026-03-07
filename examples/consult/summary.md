# consult

Multi-model expert panel consultation. Frames a problem as a sanitized brief, spawns parallel sub-agents across different LLMs (e.g., Gemini, GPT, Opus), collects independent analyses, and synthesizes into a structured recommendation with agreement/disagreement/new angles/confidence.

**Provides:** expert-consultation, multi-model-analysis, decision-support
**Requires:** sessions_spawn, subagents (for orchestration); engram-recall (optional, for storing insights)
**Triggers:** "/consult", "need a second opinion", "consult the panel"

Use for: architecture decisions, irreversible choices, genuine blind spots. NOT for: routine tasks, obvious answers, time-critical situations.
