# FAQ

## General

### What is ACR?
The Agent Capability Runtime is a framework-agnostic specification and tooling for composing agent capabilities. It defines a standard way to declare, resolve, load, and manage the behavioral instructions, tools, and context that AI agents need.

### Why not just use SKILL.md files?
SKILL.md files work, but they have no metadata, no dependency declarations, no budget management, and no composition model. ACR adds a manifest layer that makes skills composable, measurable, and interoperable — without replacing the skill content itself (SKILL.md becomes `standard.md`).

### Is this specific to OpenClaw / LangChain / [framework]?
No. ACR is framework-agnostic. The manifest format and resolution semantics are designed to be implemented by any agent framework. The spec includes a framework mapping table for converting from various existing formats.

### How does this relate to MCP?
MCP standardizes **tool interfaces** (how agents call APIs). ACR standardizes **capability composition** (how behavioral instructions, tool bindings, and context are bundled and managed). They're complementary — ACR capabilities declare MCP tools in their `requires.tools` section.

## Technical

### What are the resolution levels?
Four levels, inspired by Level-of-Detail in 3D graphics:

| Level | Size | When |
|-------|------|------|
| **Index** | ~15 tokens | Always loaded (capability registry) |
| **Summary** | ~200 tokens | When potentially relevant |
| **Standard** | ~2K tokens | When actively being used |
| **Deep** | ~5K tokens | Complex tasks, first-time use |

Each level includes all content from lower levels. You only pay for one level at a time.

### How does budget fitting work?
The resolver uses bin-packing to fit capabilities into your context window. Each capability declares its token budget at each resolution level. The resolver assigns resolution levels to maximize capability within the available budget, demoting lower-priority capabilities when space is tight.

### What happens when two capabilities conflict?
If two capabilities share `provides` tags and declare each other in `conflicts`, the resolver raises a `CONFLICT` error. Session Policies can resolve conflicts by specifying preferred implementations.

### Can I have capabilities that depend on other capabilities?
Yes. Use `requires.capabilities` to declare dependencies. The resolver handles transitive dependency resolution and topological sorting for correct load order.

### What's a Capability Set?
A capability set bundles related capabilities for a domain (e.g., `engineering.code-change` = git + PR review + testing + linting). It uses the same manifest format with `type: capability-set` and declares a `children_total` budget.

### What's a Role?
A Role is a policy-and-persona lens over capability sets. It defines who the agent is (tone, priorities, escalation rules) and which capability sets are available. Roles don't contain detailed procedures — those live in capabilities.

## Migration

### How do I migrate existing skills?
```bash
acr migrate ./SKILL.md
```
This generates a capability directory. Review the TODOs in the generated `capability.yaml`.

### Do I have to migrate all at once?
No. Legacy skills (SKILL.md without capability.yaml) continue to work. The runtime treats them as single-resolution capabilities. You can migrate incrementally.

### What about Cursor rules / Claude projects?
See the [Migration Guide](migration-guide.md) for framework-specific mapping.

## Ecosystem

### Where do I publish capabilities?
Any npm-compatible registry, or a dedicated ACR registry. The package format is a directory with `capability.yaml` and resolution files.

### How do I search for capabilities?
```bash
acr search --provides code-review
```
(Registry support coming in Phase 4)

### Can I have private capabilities?
Yes. Capabilities are just directories. Keep them in your private repo, or use a private registry.
