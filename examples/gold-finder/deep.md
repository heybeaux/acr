---
name: gold-finder
description: "Deep analysis mode for gold-finder. Adds industry research, competitor benchmarks, case studies, and dollar-value impact estimates to the standard report."
---

# Gold Finder — Deep Analysis

Everything in standard mode, plus:

## Additional Research

1. **Industry Benchmarks** — Spawn a sub-agent to research AI adoption rates and ROI benchmarks in the client's industry
2. **Competitor Intelligence** — What are competitors doing with AI/automation? Where is the client behind or ahead?
3. **Case Studies** — Find 2-3 relevant case studies of similar businesses implementing the recommended solutions
4. **Dollar Impact** — Estimate concrete financial impact using industry benchmarks (e.g., "AI-powered support typically deflects 30-40% of tickets at $8-12/ticket")

## Deep Workflow

1. Run standard analysis first
2. Spawn research sub-agent: `sessions_spawn(task: "Research AI adoption in [industry]. Find: adoption rates, common use cases, ROI benchmarks, case studies of [specific solutions]. Return structured findings.", model: "openrouter/google/gemini-2.5-pro", mode: "run", label: "gold-research")`
3. Integrate research findings into the report
4. Add a "Market Context" section before the opportunity map
5. Add dollar estimates to each opportunity where data supports it

## Market Context Section

```markdown
## Market Context

### AI Adoption in [Industry]
- Current adoption rate: [X%]
- Top use cases: [list]
- Average ROI reported: [range]

### Competitive Landscape
- [What competitors are doing]
- [Where the client sits relative to market]

### Relevant Case Studies
1. **[Company]** — [What they did, what happened]
2. **[Company]** — [What they did, what happened]
```

## Dollar Impact Template

For each opportunity where benchmarks exist:

```markdown
**Estimated Financial Impact:**
- Current cost: ~$[X]/year (based on [hours × rate] or [volume × cost])
- Post-automation: ~$[Y]/year
- Annual savings: ~$[X-Y]
- Implementation cost: ~$[Z]
- Payback period: ~[months]
- Source: [benchmark/case study reference]
```

Be transparent about estimate confidence. Use ranges, not false precision.
