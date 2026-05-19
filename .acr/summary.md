# ACR (Agent Capability Runtime)

The capability faculty in the Sonder stack. ACR is the *operating system between an agent and its tools* — it manages what capabilities are loaded into the context window, at what resolution (4 LOD levels), within what budget. Four levels per capability: index (~20 tok), summary (~95), standard (~1250), deep (~2500+). Yields ~98% token reduction at cold start vs naive tool loading and ~67% with active tools loaded.

**Provides:** capability-faculty, lod-loader, task-resolver, context-manager
**Repo:** https://github.com/heybeaux/acr
**Relates to:** powers the territory map (this repo), serves as the capability slot in Sonder envelopes
