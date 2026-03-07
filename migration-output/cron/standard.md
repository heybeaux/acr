---
name: cron
description: Schedule reminders, recurring jobs, and background tasks using Clawdbot's cron system. Use when setting reminders, scheduling tasks, creating recurring jobs, or managing scheduled automation. Triggers on "remind me", "schedule", "every day at", "in 20 minutes", "recurring", "cron job", etc.
---

# Cron Scheduling

Schedule one-shot reminders or recurring background jobs via the Gateway's cron system.

## Quick Reference

### One-Shot Reminder (Main Session)

```json
{
  "action": "add",
  "job": {
    "name": "Meeting reminder",
    "schedule": {"kind": "at", "atMs": 1769871600000},
    "sessionTarget": "main",
    "wakeMode": "now",
    "payload": {"kind": "systemEvent", "text": "🔔 Reminder: Your meeting starts in 15 minutes!"},
    "deleteAfterRun": true
  }
}
```

### Recurring Job (Isolated Session with Delivery)

```json
{
  "action": "add",
  "job": {
    "name": "Morning briefing",
    "schedule": {"kind": "cron", "expr": "0 7 * * *", "tz": "America/Vancouver"},
    "sessionTarget": "isolated",
    "wakeMode": "now",
    "payload": {
      "kind": "agentTurn",
      "message": "Summarize inbox and calendar for today.",
      "deliver": true,
      "channel": "whatsapp",
      "to": "+16043639155"
    }
  }
}
```

### Interval-Based Job

```json
{
  "action": "add",
  "job": {
    "name": "Hourly check",
    "schedule": {"kind": "every", "everyMs": 3600000},
    "sessionTarget": "main",
    "wakeMode": "next-heartbeat",
    "payload": {"kind": "systemEvent", "text": "Hourly check triggered"}
  }
}
```

## Required Fields

| Field | Description |
|-------|-------------|
| `name` | Human-readable job name |
| `schedule` | When to run (see Schedule Types) |
| `sessionTarget` | `"main"` or `"isolated"` |
| `payload` | What to do (see Payload Types) |

## Schedule Types

### `at` - One-shot timestamp
```json
{"kind": "at", "atMs": 1769871600000}
```
- `atMs`: Unix timestamp in milliseconds

### `every` - Fixed interval
```json
{"kind": "every", "everyMs": 3600000}
```
- `everyMs`: Interval in milliseconds (e.g., 3600000 = 1 hour)
- `anchorMs`: Optional anchor timestamp

### `cron` - Cron expression
```json
{"kind": "cron", "expr": "0 9 * * 1-5", "tz": "America/Vancouver"}
```
- `expr`: 5-field cron expression
- `tz`: Optional IANA timezone (defaults to host timezone)

## Payload Types

### `systemEvent` - Main session only
```json
{"kind": "systemEvent", "text": "Your reminder text here"}
```
Injects text into the main session via heartbeat.

### `agentTurn` - Isolated session only
```json
{
  "kind": "agentTurn",
  "message": "Task prompt for the agent",
  "deliver": true,
  "channel": "whatsapp",
  "to": "+15551234567"
}
```

Optional `agentTurn` fields:
- `model`: Override model (e.g., `"opus"`)
- `thinking`: Override thinking level (`"off"`, `"low"`, `"medium"`, `"high"`)
- `timeoutSeconds`: Timeout override
- `deliver`: `true` to send output to channel
- `channel`: `"whatsapp"`, `"telegram"`, `"discord"`, `"slack"`, `"signal"`, `"last"`
- `to`: Target recipient
- `bestEffortDeliver`: Don't fail job if delivery fails

## Optional Fields

| Field | Default | Description |
|-------|---------|-------------|
| `wakeMode` | `"next-heartbeat"` | `"now"` for immediate, `"next-heartbeat"` to wait |
| `deleteAfterRun` | `false` | Auto-delete after successful one-shot |
| `enabled` | `true` | Enable/disable the job |
| `description` | - | Optional description |

## Common Patterns

### Reminder in N minutes
Calculate `atMs` = `Date.now() + (minutes * 60 * 1000)`

### Daily at specific time
Use cron: `{"kind": "cron", "expr": "0 9 * * *", "tz": "America/Vancouver"}` (9am daily)

### Weekdays only
Cron: `"0 9 * * 1-5"` (Mon-Fri)

## Actions

- `list` - List all jobs
- `add` - Create new job (requires `job` object)
- `update` - Modify job (requires `jobId` + `patch`)
- `remove` - Delete job (requires `jobId`)
- `run` - Manually trigger job (requires `jobId`)
- `runs` - View run history (requires `jobId`)
- `status` - Cron system status

## Matching Rules

- `sessionTarget: "main"` → `payload.kind: "systemEvent"`
- `sessionTarget: "isolated"` → `payload.kind: "agentTurn"`

Mismatching these causes validation errors.
