# Share Team — ACR Quick Start Guide

**How to create client profiles, brand overlays, and campaign capabilities for Share.**

No coding required. If you can fill out a form, you can build these.

---

## What You're Building (Big Picture)

```
You build ONCE (generic):        You build PER CLIENT:
├── email-copywriting            ├── intervarsity-brand (overlay)
├── campaign-strategy            ├── ob-brand (overlay)
├── red-team-review              ├── map-brand (overlay)
├── social-content               └── etc.
└── visual-creative
```

The generic capabilities know HOW to do the work.
The client overlays know WHO you're doing it for.

---

## Step 1: Create a Client Overlay

This is the most common thing you'll do. Every new client gets one.

### Create the folder

```
clients/
└── intervarsity/
    ├── capability.yaml    ← the manifest (copy the template below)
    ├── index.txt          ← one line about this client
    ├── summary.md         ← key facts at a glance
    └── standard.md        ← everything the AI needs to know
```

### index.txt (one line — that's it)

```
intervarsity: InterVarsity Christian Fellowship — campus ministry, young donor base, warm/invitational voice.
```

### summary.md (the cheat sheet)

Write this like you're briefing a new team member in 60 seconds:

```markdown
# InterVarsity — Quick Reference

- **Full Name:** InterVarsity Christian Fellowship
- **Sector:** Higher education / campus ministry
- **Audience:** College students, young alumni, parents
- **Voice:** Warm, invitational, community-focused
- **Don't:** Guilt-based appeals, denominational favoritism
- **Do:** Say "partner" not "donor", emphasize belonging
- **Current campaigns:** Easter recurring gift drive
- **Key contact:** Dabney (cultivation content)
```

### standard.md (the full brief)

This is where you put everything the AI needs. Write it like a brand guide meets an account brief:

```markdown
# InterVarsity — Full Client Profile

## Organization
InterVarsity Christian Fellowship is a campus ministry...

## Brand Voice
- Tone: [describe it like you'd tell a new copywriter]
- Examples of good copy: [paste real examples that nailed it]
- Examples of bad copy: [paste things that missed the mark]

## Audience Segments
- Segment 1: College students (18-22)
  - What motivates them: [...]
  - What turns them off: [...]
- Segment 2: Young alumni (23-30)
  - ...

## Red Lines (things to NEVER do)
- Never use guilt-based fundraising language
- Never take sides on denominational issues
- Never assume the reader is already a Christian

## Past Campaign Performance
- Spring 2025 email series: [what worked, what didn't]
- Year-end 2025: [results, learnings]

## Technical Details
- Email platform: [whatever they use]
- Donation platform: [WeGive, etc.]
- Tracking: [any specific SOL codes, UTM conventions]

## Key People
- Angela: [role, preferences, communication style]
- Dabney: [role, what they care about]
```

### capability.yaml (copy this template, fill in the blanks)

```yaml
name: intervarsity-brand
type: capability
version: 1.0.0
description: "InterVarsity Christian Fellowship — brand voice, audience, campaign history, and org-specific rules."

provides:
  - client-profile
  - intervarsity

requires:
  tools: []
  capabilities: []
  context: []

budget:
  index: 15
  summary: 200
  standard: 1200

activation:
  triggers:
    - type: pattern
      match: "(?i)(intervarsity|inter.varsity|\\bIV\\b)"
  trigger_logic: OR
  co_activates: []
  conflicts: []

permissions:
  data:
    client_data: read-only

behavioral:
  core: |
    When working on InterVarsity content:
    - Use warm, invitational tone
    - Say "partner" not "donor"
    - Never use guilt-based appeals
    - Stay denominationally neutral
    - Target audience skews young — mobile-first
  overlays: []

state_schema:
  version: 1
  max_size_tokens: 100
  fields:
    - name: active_campaign
      type: string
    - name: last_approval_status
      type: string

verification:
  checklist:
    - "Content matches brand voice"
    - "No red line violations"
    - "Audience segment is appropriate"
  completion_signal: content_approved
```

**That's it.** Four files per client. The AI reads them when that client comes up and immediately knows who they are, how they talk, and what not to do.

---

## Step 2: Add Red Team Rules Per Client

You can either add a red team section to the client's `standard.md`, or create a separate capability. For most clients, just add a section:

### Add to the client's standard.md:

```markdown
## Red Team Rules (Client-Specific)

When reviewing content for InterVarsity, flag:
- [ ] Any guilt-based language ("you must," "how can you ignore")
- [ ] Denominational bias (Catholic vs Protestant vs Orthodox)
- [ ] Assumptions that readers are already Christian
- [ ] Language that commodifies student experiences
- [ ] Urgency that feels manufactured (they're a relationship org, not disaster relief)
- [ ] Anything that wouldn't feel natural in a campus coffee shop conversation
```

The generic red team capability will pick these up automatically when the InterVarsity overlay is mounted.

---

## Step 3: Validate Your Work

After creating a client overlay, check it:

```bash
cd acr
acr validate clients/intervarsity/
```

You want to see: `✅ Valid`

If something's wrong, it'll tell you exactly what to fix.

---

## Quick Reference: What Goes Where

| Thing you want to capture | Where it goes |
|---------------------------|---------------|
| Client's brand voice | `standard.md` → Brand Voice section |
| Colors, fonts, logos | `standard.md` → Brand Assets section (or link to Figma) |
| Past campaign results | `standard.md` → Past Campaign Performance |
| Things to NEVER do | `standard.md` → Red Lines section |
| Things the red team should catch | `standard.md` → Red Team Rules section |
| Key people and their preferences | `standard.md` → Key People section |
| Tracking codes / SOL codes | `standard.md` → Technical Details section |
| "We learned X from last campaign" | `standard.md` → update Past Campaign Performance |
| Quick client context for the team | `summary.md` |

---

## Updating Client Profiles

As you learn more about a client, just update their files:

- **After a meeting:** Add notes to `standard.md` (new preferences, feedback, learnings)
- **After a campaign:** Update Past Campaign Performance with results
- **New red line discovered:** Add it to the Red Team Rules section
- **Contact change:** Update Key People

The AI picks up changes immediately on the next run. No deployment, no code, just edit the file.

---

## Creating a New Generic Capability

This is less common — Beaux will usually handle these. But if you want to:

1. **Create the folder** with the four files (capability.yaml, index.txt, summary.md, standard.md)
2. **Write the standard.md** as if you're training a really smart new hire — tell them exactly how to do the task
3. **Fill in the capability.yaml** using the template above
4. **Run `acr validate`** to check your work

The key question for standard.md: **"If I hired a smart person and handed them just this document, could they do the job?"** If yes, it's good enough.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Writing vague brand voice ("be professional") | Be specific: "Write like you're texting a friend who volunteers at church — casual but sincere" |
| Forgetting to include real examples | Paste actual good/bad copy samples. AI learns from examples better than rules. |
| Making standard.md too long | Keep it under 1,500 tokens (~3 pages). If you need more, use deep.md |
| Not updating after campaigns | Set a reminder: after every campaign wraps, spend 10 minutes updating the profile |
| Writing red team rules as suggestions | Write them as hard rules: "FLAG if..." not "Consider whether..." |

---

## Need Help?

- **"I don't know what to put in a section"** → Leave it blank with a TODO. Something is better than nothing.
- **"How do I check token count?"** → Run `acr budget clients/intervarsity/`
- **"I want to test it before going live"** → Ask Beaux to run a test pipeline with your overlay.
- **"The YAML syntax is confusing"** → Copy an existing client's capability.yaml and just change the names and descriptions. Don't write YAML from scratch.
