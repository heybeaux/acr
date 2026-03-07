---
name: linkedin
description: LinkedIn automation via browser relay or the official LinkedIn API. Use for posting, messaging, viewing profiles, analytics, and network actions.
homepage: https://linkedin.com
metadata: {"clawdbot":{"emoji":"💼"}}
---

# LinkedIn

## ⚡ IMPORTANT: API Token Already Exists

**DO NOT use browser automation for posting.** We have a real LinkedIn API token.

**Token file:** `~/.config/clawdbot/secrets/linkedin-tokens.json`
**Scripts:** `~/projects/linkedin/scripts/linkedin-api.sh`
**Config:** `~/projects/linkedin/config.json`
**Post drafts:** `~/projects/linkedin/posts/`
**Profile URN:** `urn:li:person:Ih92Ubiy11`

### Load the API utils:
```bash
source ~/projects/linkedin/scripts/linkedin-api.sh
```

### Post to LinkedIn via API:
```bash
source ~/projects/linkedin/scripts/linkedin-api.sh
linkedin_post "Your post text here"
```

### Check token validity:
```bash
ACCESS_TOKEN=$(jq -r '.accessToken' ~/.config/clawdbot/secrets/linkedin-tokens.json)
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" https://api.linkedin.com/v2/userinfo | jq .
```

### Post a saved draft (by file):
```bash
source ~/projects/linkedin/scripts/post-utils.sh
# reads draft JSON, posts via API, updates status + URL
```

---

## Token Details
- **Location:** `~/.config/clawdbot/secrets/linkedin-tokens.json`
- **Fields:** `accessToken`, `clientId`, `clientSecret`, `expiresIn`, `createdAt`
- **API base:** `https://api.linkedin.com/v2/`
- **Auth header:** `Authorization: Bearer <accessToken>`
- **Token expires:** ~60 days from `createdAt` (Unix timestamp). If expired, run `~/projects/linkedin/scripts/oauth-setup.sh`

---

## Marketing Team Crons (Active)
All posting goes through the API — no browser needed:
- **Scout** (Mon/Wed/Fri 7AM) — researches topics
- **Creator** (Mon–Fri 8AM) — drafts post, sends to Beaux via WhatsApp for approval
- **Nurture** (Wed + Fri 9AM) — DM outreach to warm leads
- **Analyst** (Mon–Fri 6PM) — pulls engagement metrics via API
- **Strategist** (Sun 8PM) — weekly strategy review

## Approval Flow
1. Creator drafts post → WhatsApp to Beaux
2. Beaux replies 👍 = post now, ✏️ = edit then post, 👎 = reject with reason
3. On 👍/edit: call `linkedin_post_draft` from `linkedin-api.sh`

---

## Browser Automation (Fallback Only)
Only use browser for things the API can't do (e.g., reading messages, viewing profiles):

### Chrome Extension Relay
1. Open LinkedIn in Chrome and log in
2. Click the OpenClaw Browser Relay toolbar icon to attach tab
3. Use `browser` tool with `profile="chrome"`

### Safety Rules (browser only)
- Never send messages without explicit approval
- Rate limit: ~30 actions/hour max
- LinkedIn aggressively detects automation — prefer API

---

## Troubleshooting
- **401 Unauthorized:** Token expired → run `~/projects/linkedin/scripts/oauth-setup.sh`
- **403 Forbidden:** Missing API scope — token needs re-auth with correct permissions
- **Rate limited:** Back off 24h, reduce frequency
