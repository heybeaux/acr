---
layout: default
title: ACR + MCP — Complementary Layers
description: How ACR and MCP work together. MCP is the wire protocol. ACR is the context manager.
---

# ACR + MCP: Complementary Layers

## The Relationship

**MCP** (Model Context Protocol) defines the wire protocol — how agents discover and call tools. It's the plumbing. Standardized, well-adopted, essential.

**ACR** (Agent Capability Runtime) manages what goes into the agent's context window — which capabilities are loaded, at what resolution, with what budget. It's the OS layer on top of the plumbing.

They solve different problems:

| Concern | MCP | ACR |
|---------|-----|-----|
| Tool discovery | ✅ Server listing | ❌ Not its job |
| Tool execution | ✅ JSON-RPC | ❌ Not its job |
| Context budget | ❌ | ✅ LOD, eviction, promotion |
| Dynamic loading | ❌ | ✅ Triggers, mount/unmount |
| State persistence | ❌ | ✅ Serialize across eviction |
| Multi-resolution | ❌ | ✅ index/summary/standard/deep |

## Why MCP Needs ACR

MCP tells the agent what tools exist. But MCP doesn't answer:

1. **Which tool instructions should be in context right now?** An agent with 50 MCP tools doesn't need all 50 instruction sets loaded. ACR provides LOD-based loading — full instructions for active tools, one-liners for the rest.

2. **What happens when context gets full?** MCP has no concept of context pressure. ACR manages budget, evicts low-priority capabilities, demotes resolutions, and preserves state across eviction.

3. **How do tools compose?** MCP tools are independent endpoints. ACR capabilities declare dependencies, co-activation rules, and provide/require contracts.

## Integration Points

### MCP Tools → ACR Capabilities

An ACR capability can wrap one or more MCP tools:

```yaml
name: linear
requires:
  tools:
    - mcp-linear-create
    - mcp-linear-search
    - mcp-linear-update
```

When the `linear` capability is mounted, ACR ensures:
- The right MCP tool instructions are in context
- At the right resolution level
- Within budget
- With state restored from last session

### ACR as Context Manager for MCP Deployments

For agents with many MCP servers, ACR provides the missing orchestration:

1. **Cold start:** Register all MCP tools as ACR capabilities at `index` level (~10 tokens each)
2. **Active use:** When a user mentions a topic, triggers promote relevant capabilities
3. **Budget pressure:** Evict least-relevant tool instructions, keeping state
4. **Session end:** Serialize tool state for next session

Without ACR, agents load all MCP tool instructions at once — burning context budget on tools they may never use.

## The Vision

MCP standardizes the wire. ACR standardizes the context. Together, they give agents:

- **Discovery** (MCP) + **Relevance** (ACR): Know what tools exist AND which ones matter right now
- **Execution** (MCP) + **Instructions** (ACR): Call tools AND know how to use them well
- **Connection** (MCP) + **Memory** (ACR): Connect to services AND remember state across sessions

ACR is not a replacement for MCP. It's the layer that makes MCP-equipped agents smarter about what they load, when they load it, and how they manage the finite resource of the context window.
