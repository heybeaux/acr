---
name: linkedin-automator
description: Automate LinkedIn content creation, posting, engagement tracking, and audience growth. Use for posting content, scheduling posts, analyzing engagement metrics, generating content ideas, commenting on posts, and building LinkedIn presence. Uses the LinkedIn API (no browser needed).
metadata: {"openclaw":{"emoji":"💼"}}
---

# LinkedIn Automator

## ⚡ Token Location — Always Check This First

**`~/.config/clawdbot/secrets/linkedin-tokens.json`**

```bash
# Verify token works
ACCESS_TOKEN=$(jq -r '.accessToken' ~/.config/clawdbot/secrets/linkedin-tokens.json)
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" https://api.linkedin.com/v2/userinfo | jq .
```

If 401: token expired → run `~/projects/linkedin/scripts/oauth-setup.sh`

---

## Key Files

| File | Purpose |
|------|---------|
| `~/.config/clawdbot/secrets/linkedin-tokens.json` | **API tokens** |
| `~/projects/linkedin/config.json` | Posting config, profile URN, schedule |
| `~/projects/linkedin/scripts/linkedin-api.sh` | Core API functions (source this) |
| `~/projects/linkedin/scripts/post-utils.sh` | Draft posting helpers |
| `~/projects/linkedin/scripts/oauth-setup.sh` | Re-auth if token expires |
| `~/projects/linkedin/posts/` | Post drafts (JSON files) |
| `~/projects/linkedin/templates/voice-guide.md` | Beaux's voice + tone guide |
| `~/projects/linkedin/analytics/` | Engagement reports |
| `~/projects/linkedin/hooks/` | Daily content hooks |

**Profile URN:** `urn:li:person:Ih92Ubiy11`

---

## Posting Content

### Quick post:
```bash
source ~/projects/linkedin/scripts/linkedin-api.sh
linkedin_post "Your post text here"
```

### Post a saved draft:
```bash
source ~/projects/linkedin/scripts/linkedin-api.sh
source ~/projects/linkedin/scripts/post-utils.sh
linkedin_post_draft ~/projects/linkedin/posts/YYYY-MM-DD-slug.json
```

### Draft JSON schema:
```json
{
  "id": "2026-03-04-slug",
  "title": "Internal reference",
  "content": "Actual LinkedIn post text...",
  "status": "draft|approved|rejected|posted|failed",
  "sourceContext": "What inspired this",
  "createdAt": "ISO timestamp",
  "approvedAt": null,
  "postedAt": null,
  "linkedinUrl": null
}
```

---

## Analytics

```bash
source ~/projects/linkedin/scripts/linkedin-api.sh
linkedin_engagement          # recent post metrics
linkedin_recent_posts        # list recent posts
linkedin_comments            # recent comments
```

---

## WhatsApp Approval Flow

When drafting for Beaux, send via WhatsApp:
```
📝 LINKEDIN DRAFT

[full post text]

---
Reply:
👍 = approve & post now
✏️ = type your revised version
👎 = reject (tell me why)
```

On 👍: call `linkedin_post_draft` immediately
On edits: confirm revision, then post
On 👎: save rejection reason in the JSON, do NOT auto-redraft

---

## Rate Limits
- Posts: max 2-3/day (we target 1/day, 5x/week)
- API calls: stay reasonable, don't hammer metrics every minute
- Analyzer cron runs once daily at 6PM — don't add more frequent polling

## Token Renewal
Token lasts ~60 days. `createdAt` in tokens file is Unix timestamp.
If expired: `~/projects/linkedin/scripts/oauth-setup.sh`
App credentials: clientId `86pdgh5f0ffj65`, secret in tokens file.
