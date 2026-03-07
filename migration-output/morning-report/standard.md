---
name: morning-report
description: Generate a daily morning briefing for Beaux. Use when starting the day, when asked for a "morning report", "daily briefing", "what's on today", or similar. Covers tasks, priorities, AI/tech news, weather, and business growth opportunities.
---

# Morning Report

Generate a comprehensive daily briefing to start the day.

## Report Structure

### 1. Header
- Day of week, full date
- Current weather for Powell River, BC (use weather skill)
- Brief motivational or contextual note if relevant

### 2. Priority Tasks
- Check `memory/YYYY-MM-DD.md` (today) and recent days for outstanding items
- Check Linear for open tickets **assigned to Beaux only** (see Linear query below)
- Check calendar for today's events (if gcalcli configured)
- Highlight anything with a deadline today or overdue
- Format as actionable checklist

#### Linear Query for Beaux's Tickets

**Beaux's Linear User ID:** `f1b24353-9741-41a2-8775-e63d0d9d74e7`

```bash
LINEAR_API_KEY=$(cat ~/.config/clawdbot/secrets/linear-api-key) && curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query": "query { issues(filter: { assignee: { id: { eq: \"f1b24353-9741-41a2-8775-e63d0d9d74e7\" } }, state: { type: { nin: [\"completed\", \"canceled\"] } } }, first: 30, orderBy: priority) { nodes { identifier title state { name } priority } } }"}' | jq '.data.issues.nodes'
```

This filters to:
- Only tickets assigned to Beaux
- Excludes completed/canceled states
- Orders by priority (urgent first)

### 3. Active Projects Status
Quick status on each active project:
- **WhaleHawk** — Salesforce integration status, pending tickets
- **Generosity Catalyst** — Current sprint, blockers
- **Wilderness Committee** — Handover progress
- **heybeaux.dev** — Content pipeline, any scheduled posts

Adjust based on what's actually active in memory files.

### 4. AI & Tech News
Use `web_search` to find 3-5 notable stories from the past 24 hours:
- AI/LLM developments (new models, major announcements)
- Developer tooling updates
- Startup/founder relevant news
- Salesforce ecosystem news (when relevant)

Keep summaries to 1-2 sentences each with source links.

### 5. Business Growth Nudges
Rotate through these (pick 1-2 per day):
- **LinkedIn check:** Any engagement on recent posts? Comments to respond to?
- **Content pipeline:** What's the next scheduled post? Any drafts to finish?
- **Outreach opportunity:** Anyone to follow up with? Cold outreach ideas?
- **Learning:** Any courses, tutorials, or skills to develop?
- **Network:** Conferences, meetups, or community engagement opportunities?

### 6. Daily Intention (Optional)
If there's a clear "one thing" that would make today a win, call it out.

## Formatting

Use clear headers and bullet points. Keep the full report scannable — aim for something that takes 2 minutes to read.

## Example Opening

```
☀️ FRIDAY, JANUARY 31, 2026
Powell River: 8°C, partly cloudy, light wind

Good morning! Here's what's on deck...
```

## Tools Used
- `weather` skill — Powell River forecast
- `linear` skill — Open tickets
- `memory_search` / `memory_get` — Tasks and context
- `web_search` — AI/tech news
- Calendar (gcalcli) — Day's events (when configured)

## Delivery
Format for WhatsApp (no markdown tables, use bullets and bold).
