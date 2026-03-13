---
layout: default
title: Client Setup Guide
description: How to create client profiles, brand overlays, and campaign capabilities with ACR. No coding required.
---

# Client Setup Guide

**How to create client profiles, brand overlays, and capabilities with ACR.**

No coding required. If you can fill out a form, you can build these.

---

## What You're Building (Big Picture)

```
You build ONCE (generic):        You build PER CLIENT:
├── email-copywriting            ├── acme-brand (overlay)
├── campaign-strategy            ├── globex-brand (overlay)
├── red-team-review              ├── initech-brand (overlay)
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
└── acme-nonprofit/
    ├── capability.yaml    ← the manifest (copy the template below)
    ├── index.txt          ← one line about this client
    ├── summary.md         ← key facts at a glance
    └── standard.md        ← everything the AI needs to know
```

### index.txt (one line — that's it)

```
acme-nonprofit: Acme Foundation — youth education nonprofit, warm/invitational voice.
```

### summary.md (the cheat sheet)

Write this like you're briefing a new team member in 60 seconds:

```markdown
# Acme Foundation — Quick Reference

- **Full Name:** Acme Foundation
- **Sector:** Youth education / community development
- **Audience:** Parents, educators, community donors
- **Voice:** Warm, invitational, community-focused
- **Don't:** Guilt-based appeals, political messaging
- **Do:** Say "partner" not "donor", emphasize impact
- **Current campaigns:** Spring enrollment drive
- **Key contact:** Jamie (marketing lead)
```

### standard.md (the full brief)

This is where you put everything the AI needs. Write it like a brand guide meets an account brief:

```markdown
# Acme Foundation — Full Client Profile

## Organization
Acme Foundation is a youth education nonprofit...

## Brand Voice
- Tone: [describe it like you'd tell a new copywriter]
- Examples of good copy: [paste real examples that nailed it]
- Examples of bad copy: [paste things that missed the mark]

## Audience Segments
- Segment 1: Parents (30-50)
  - What motivates them: [...]
  - What turns them off: [...]
- Segment 2: Educators
  - ...

## Red Lines (things to NEVER do)
- Never use guilt-based fundraising language
- Never take political sides
- Never make claims about outcomes without data

## Past Campaign Performance
- Spring 2025 email series: [what worked, what didn't]
- Year-end 2025: [results, learnings]

## Technical Details
- Email platform: [whatever they use]
- Donation platform: [Stripe, etc.]
- Tracking: [any specific UTM conventions]

## Key People
- Jamie: [role, preferences, communication style]
- Alex: [role, what they care about]
```

### capability.yaml (copy this template, fill in the blanks)

```yaml
name: acme-brand
type: capability
version: 1.0.0
description: "Acme Foundation — brand voice, audience, campaign history, and org-specific rules."

provides:
  - client-profile
  - acme-nonprofit

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
      match: "(?i)(acme|acme.foundation)"
  trigger_logic: OR
  co_activates: []
  conflicts: []

permissions:
  data:
    client_data: read-only

behavioral:
  core: |
    When working on Acme Foundation content:
    - Use warm, invitational tone
    - Say "partner" not "donor"
    - Never use guilt-based appeals
    - Stay politically neutral
    - Emphasize measurable impact
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

When reviewing content for Acme Foundation, flag:
- [ ] Any guilt-based language ("you must," "how can you ignore")
- [ ] Political messaging or partisan language
- [ ] Unverified outcome claims
- [ ] Urgency that feels manufactured
- [ ] Anything that wouldn't feel natural in a parent-teacher conversation
```

The generic red team capability will pick these up automatically when the client overlay is mounted.

---

## Step 3: Validate Your Work

After creating a client overlay, check it:

```bash
acr validate clients/acme-nonprofit/
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
| Tracking codes / UTM conventions | `standard.md` → Technical Details section |
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

Less common, but straightforward:

1. **Create the folder** with the four files (capability.yaml, index.txt, summary.md, standard.md)
2. **Write the standard.md** as if you're training a really smart new hire — tell them exactly how to do the task
3. **Fill in the capability.yaml** using the template above
4. **Run `acr validate`** to check your work

The key question for standard.md: **"If I hired a smart person and handed them just this document, could they do the job?"** If yes, it's good enough.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Writing vague brand voice ("be professional") | Be specific: "Write like you're texting a friend who cares about this cause — casual but sincere" |
| Forgetting to include real examples | Paste actual good/bad copy samples. AI learns from examples better than rules. |
| Making standard.md too long | Keep it under 1,500 tokens (~3 pages). If you need more, use deep.md |
| Not updating after campaigns | Set a reminder: after every campaign wraps, spend 10 minutes updating the profile |
| Writing red team rules as suggestions | Write them as hard rules: "FLAG if..." not "Consider whether..." |

---

## Need Help?

- **"I don't know what to put in a section"** → Leave it blank with a TODO. Something is better than nothing.
- **"How do I check token count?"** → Run `acr budget clients/acme-nonprofit/`
- **"I want to test it before going live"** → Run a test pipeline with your overlay.
- **"The YAML syntax is confusing"** → Copy an existing client's capability.yaml and just change the names and descriptions. Don't write YAML from scratch.
