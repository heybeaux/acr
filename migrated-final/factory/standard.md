---
name: factory
description: "Run the Factory 4.0 pipeline to process Linear tickets into PRs automatically. Use when: (1) user says /factory or asks to run the factory, (2) batch-processing tickets labeled factory-ready, (3) checking pipeline status, (4) resuming a crashed run. NOT for: single manual code changes (just edit), tasks without Linear tickets, or non-GC/non-Engram repos without .factory.env."
---

# Factory 4.0 — The Conductor

Automated ticket-to-PR pipeline backed by SQLite state machine.

## Quick Start

### Run a batch
```bash
cd ~/projects/ops/factory

# GC (Generosity Catalyst)
LINEAR_API_KEY="lin_api_REDACTED" \
LINEAR_TEAM_ID="e68e060f-f79e-404d-b52f-b83d760e8c85" \
npx tsx src/conductor.ts ~/generosity-catalyst --label factory-ready

# Engram (use Engram's Linear creds from TOOLS.md)
LINEAR_API_KEY="lin_api_REDACTED" \
LINEAR_TEAM_ID="f660170f-6efa-4ec5-af49-af5469a76068" \
npx tsx src/conductor.ts ~/projects/engram --label factory-ready
```

### Check status
```bash
npx tsx src/status.ts                      # Pipeline overview
npx tsx src/status.ts --history GEN-115    # Ticket state history
npx tsx src/status.ts --events             # Audit log
```

### Resume after crash
```bash
# Same command + --resume flag
npx tsx src/conductor.ts ~/generosity-catalyst --resume
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--label <name>` | `factory-ready` | Linear label to filter tickets |
| `--limit <n>` | `20` | Max tickets to process |
| `--dry-run` | off | Plan but don't execute |
| `--skip-review` | off | Skip 2x spec review voting |
| `--resume` | off | Resume existing active run |
| `--db <path>` | `../.factory-state.db` | SQLite database path |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LINEAR_API_KEY` | ✅ | — | Linear API key |
| `LINEAR_TEAM_ID` | ✅ | — | Linear team ID |
| `FACTORY_BASE_BRANCH` | | `staging` | Base branch for worktrees |
| `FACTORY_MAX_WORKERS` | | `4` | Max concurrent workers |
| `FACTORY_TICK_INTERVAL` | | `10000` | Tick interval (ms) |
| `FACTORY_WORKER_TIMEOUT` | | `900` | Worker timeout (seconds) |
| `FACTORY_DISCORD_WEBHOOK` | | — | Discord webhook URL |
| `ENGRAM_API_KEY` | | — | Engram API key for metrics |
| `FACTORY_SKIP_DEBUGGER` | | `false` | Skip debugger stage |
| `FACTORY_BASELINE_GATES` | | `true` | Run baseline gates |

## Architecture

### State Machine (16 states)
```
QUEUED → SPEC_REVIEW → DECOMPOSING → WORKSPACE_READY →
WORKER_SPAWNED → WORKER_RUNNING → VERIFYING → GATING →
DEBUGGING → PR_CREATING → PR_CREATED → DONE

(any) → FAILED → RETRY_QUEUED → WORKSPACE_READY
WORKER_RUNNING → WORKER_ABANDONED → RECOVERY_ASSESSMENT →
  → RECOVERY_WORKER (if >50% done) or WORKSPACE_READY (fresh start)
```

### Key Properties
- **Crash-safe**: All state in SQLite. Crash at any point, resume on next tick.
- **No lock contention**: Each worker gets a unique agent session ID.
- **Idempotent worktrees**: Delete-then-create, 5x retry with backoff.
- **Conflict-aware**: File footprint analysis prevents parallel tickets from touching same files.
- **Self-healing**: Gateway health check + auto-restart before spawning.
- **Non-blocking**: Fast states (polling) sequential, slow states (LLM/build) concurrent.
- **Stall detection**: Monitors worktree for file modifications, kills frozen workers.
- **Recovery workers**: Assesses partial work (tsc → LLM) before scrapping.

### Pipeline Stages
1. **Spec Review** — 2x LLM voting (completeness + security)
2. **Decomposition** — Split complex tickets into focused sub-tasks
3. **File Footprint** — Predict files to modify, detect conflicts
4. **Worker** — OpenClaw agent implements the ticket in isolated worktree
5. **Verification** — LLM checks output against spec
6. **Build Gates** — lint + typecheck + test
7. **Debugger** — Auto-fix gate failures (2 rounds max)
8. **PR Creation** — Rebase, commit, push, create PR

### Source Files
All in `~/projects/ops/factory/src/`:
- `conductor.ts` — Main tick loop + state machine
- `db.ts` — SQLite state store
- `status.ts` — Pipeline status CLI
- `recovery.ts` — Dead worker assessment
- `types.ts` — State enum, config, DB types
- `worker.ts` — Agent spawning
- `reviewer.ts` — Spec review voting
- `decomposer.ts` — Ticket decomposition
- `verifier.ts` — Output verification
- `debugger.ts` — Gate failure auto-fix
- `llm.ts` — LLM helper (OpenRouter)
- `metrics.ts` — Engram metrics
- `notify.ts` — OpenClaw + Discord notifications

## Troubleshooting

### "Gateway unhealthy" errors
```bash
openclaw gateway restart
# Then resume: npx tsx src/conductor.ts <repo> --resume
```

### Stuck tickets
```bash
# Check ticket state history
npx tsx src/status.ts --history GEN-115

# Check events
npx tsx src/status.ts --events GEN-115
```

### Worker stall
Workers are automatically killed after 10min without file changes. If a worker is stuck:
```bash
kill <pid>  # Conductor will detect dead PID on next tick and enter recovery
```

### Database inspection
```bash
sqlite3 ../.factory-state.db "SELECT ticket_id, state, attempt, last_error FROM ticket_jobs"
```

## Project Credentials

### Generosity Catalyst
- Linear API Key: `lin_api_REDACTED`
- Linear Team ID: `e68e060f-f79e-404d-b52f-b83d760e8c85`
- Factory Label ID: `c51307a5-20f2-427c-ab6c-aaabe860bfea`
- Repo: `~/generosity-catalyst`
- Base branch: `staging`

### Engram (Heybeaux)
- Linear API Key: `lin_api_REDACTED`
- Linear Team ID: `f660170f-6efa-4ec5-af49-af5469a76068`
- Repo: `~/projects/engram`
- Base branch: `main`

## Rules
- **Never run on Fridays** — Beaux's hard rule
- Always `--dry-run` first on new setups
- Max 4 workers default (Mac Mini M4 can handle it)
- Workers use `--dangerously-skip-permissions` — they're sandboxed in worktrees
- Factory 3.x (manager.ts, runner.ts) still works as fallback
