# Agent Capability Runtime (ACR) — Specification v1.0-rc1

**Author:** Cirrus ☁️ (heybeaux.dev)
**Date:** 2026-03-07
**Status:** v1.0-rc1 (Release Candidate)
**License:** MIT
**Origin:** Panel consultation + 3 review rounds (Gemini 3.1 Pro, GPT 5.4, Opus 4.6)

**Changelog:**
- v0.1 — Initial synthesis from panel consultation
- v0.2 — Applied review feedback. Removed vendor-specific references. Cut Workflows and Interfaces to Future Extensions. Flattened layer stack. Added migration path, error model, enforcement architecture, state persistence.
- v1.0-draft — Normative schema definitions. Resolved mount/trigger precedence. Clarified LOD semantics. Added fail-open/fail-closed stance. Specified state persistence lifecycle. Defined escalation contract. Editorial fixes.
- v1.0-rc1 — RFC 2119 normative language. Concurrency model. Roles & Capability Sets formalized. Trigger abstraction layer. Third-party review incorporation (GPT 5.4, Gemini 3.1 Pro, Opus 4.6).

---

## Conformance Requirements

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

A conforming ACR implementation:
- **MUST** implement the capability manifest format (Section 3)
- **MUST** implement the LOD resolution system (Section 4) with at least `index` and `standard` levels
- **MUST** implement budget enforcement (Section 7)
- **SHOULD** implement the trigger system (Section 8)
- **SHOULD** implement state persistence (Section 9)
- **MAY** implement the security proxy (Section 10)
- **MAY** implement Capability Sets and Roles (Sections 5-6)

---

## Abstract

The current AI agent ecosystem treats skills and tools as flat, unrelated primitives. There is no standard way to compose them into higher-order capabilities, manage their lifecycle within limited context windows, or define interoperable contracts between them. This problem is not unique to any single agent framework — it affects every system where LLM agents consume skills, tools, or behavioral instructions.

The Agent Capability Runtime (ACR) introduces a layered architecture for composing, resolving, loading, and managing agent capabilities. It draws from OS virtual memory, dynamic linking, 3D graphics LOD systems, and scope-restricted security to create a practical, buildable framework that works within context window constraints.

ACR is designed to be **framework-agnostic**. It defines portable formats and runtime semantics that any agent framework can implement.

---

## 1. Problem Statement

### Current State
- **Skills** are non-standardized bundles of context (markdown + scripts) injected into agent prompts. No machine-readable metadata, no dependency declarations, no composition model. Formats vary across frameworks.
- **MCP Tools** provide standardized tool interfaces but carry no behavioral context. They are action surfaces without operational instructions.
- **Context Windows** are the fundamental constraint. Agents cannot load everything at once. Today's solution: developers manually curate which skills to load per session.

### What's Missing
1. **No composition model** — A capability that requires 3 tools + 2 reference docs + specific behavioral instructions has no way to declare or enforce that binding.
2. **No dependency resolution** — Skills cannot declare what they need or what they provide. No conflict detection, no transitive dependency walking.
3. **No resource management** — No mechanism to progressively load context based on need, or unload unused capabilities to free context space.
4. **No contracts** — Skills don't declare what they provide. You can't swap implementations or verify behavior against a spec.
5. **No scoped security** — Tools are exposed globally. No scope-restricted access control per task or session.

---

## 2. Architecture Overview

ACR has four structural concepts, a runtime, and a configuration layer:

| Component | Type | Purpose |
|-----------|------|---------|
| **Primitives** | Building block | Raw reusable assets (instructions, docs, tool bindings, scripts, evaluators, memory sources) |
| **Capabilities** | Core unit | Manifest-driven bundles binding behavior + tools + context + policy |
| **Capability Sets** | Composition | Domain bundles grouping related capabilities |
| **Roles** | Policy lens | Identity + persona + policy over capability sets |
| **Context Manager** | Runtime | Resolver + Loader + Capability Proxy |
| **Session Policies** | Configuration | Scoped resolution rules + permission overrides per session type |

**Design principles:**
- Capabilities are the fundamental unit. Everything else composes or configures them.
- Session Policies are a runtime configuration concern, not a structural layer.
- The runtime manages resolution, loading, paging, enforcement, and error handling.
- All formats are portable across agent frameworks.

```
                    ┌─────────────┐
                    │    Roles    │  Policy + persona
                    └──────┬──────┘
                           │ composes
                    ┌──────▼──────┐
                    │ Cap. Sets   │  Domain bundles
                    └──────┬──────┘
                           │ bundles
                    ┌──────▼──────┐
                    │Capabilities │  Core unit
                    └──────┬──────┘
                           │ binds
                    ┌──────▼──────┐
                    │ Primitives  │  Raw assets
                    └─────────────┘

  Runtime: Context Manager (Resolver + Loader + Proxy)
  Config:  Session Policies
```

---

## 3. Primitives

Raw, reusable building blocks. Primitives are referenced by capability manifests — they have no standalone runtime behavior.

| Primitive | Description | Example |
|-----------|-------------|---------|
| **Instruction** | Behavioral prompt text | "When reviewing code, check for security, correctness, regressions" |
| **Reference Doc** | Supporting context material | API docs, coding standards, rubrics |
| **Tool Binding** | MCP server URI or tool schema | `github` MCP, `postgres` MCP |
| **Script** | Executable automation | `verify-endpoints.sh`, `batch_upsert.py` |
| **Evaluator** | Verification/test logic | "Did you check CI status before approving?" |
| **Memory Source** | Retrieval-augmented context | Vector search endpoints, RAG sources |

---

## 4. Capabilities (The Core Unit)

A **Capability** is the fundamental unit of composition. It is a manifest-driven bundle that binds behavior, tools, context, and policy into a single deployable unit.

### 4.1 Capability Manifest — Normative Schema

Every capability MUST have a `capability.yaml` manifest. The following fields are defined:

```yaml
# === REQUIRED FIELDS ===

name: github-pr-review                    # string, unique identifier
version: 1.2.0                            # string, semver
type: capability                          # enum: "capability" | "capability-set"
description: "Review GitHub PRs"          # string, human-readable

# === PROVIDES (required) ===
# Tags declaring what this capability offers.
# Used for conflict detection and future interface matching.
provides:                                  # string[], min 1
  - code-review
  - pr-management

# === REQUIRES (optional) ===
requires:
  tools:                                   # ToolRequirement[]
    - mcp: github                          # string, MCP server name
      methods:                             # string[], required methods
        - get_pull_request
        - list_reviews
        - create_review
      optional: false                      # boolean, default false
    - mcp: diff-analyzer
      optional: true
  capabilities:                            # CapabilityRequirement[]
    - name: git-basics                     # string, capability name
      resolution: summary                  # enum: "index"|"summary"|"standard"|"deep"
      optional: false                      # boolean, default false
  context:                                 # ContextRequirement[]
    - ref: team-coding-standards           # string, named reference doc
      optional: true

# === BUDGET (required) ===
# Token counts at each resolution level.
# Each level INCLUDES the content of all lower levels — mounting at
# standard means you do NOT also pay for summary separately.
budget:
  index: 15                                # integer, tokens
  summary: 200                             # integer, tokens
  standard: 1800                           # integer, tokens
  deep: 5500                               # integer, tokens

# === ACTIVATION (optional) ===
activation:
  triggers:                                # Trigger[]
    - type: pattern                        # enum: "pattern" | "runtime_event"
      match: "review (this |the )?PR"      # string, regex for pattern type
    - type: runtime_event
      condition: tool_available("github")  # string, evaluator expression
  trigger_logic: OR                        # enum: "OR" | "AND", default "OR"
  co_activates:                            # string[], capability names
    - git-basics
  conflicts:                               # string[], capability names
    - gitlab-mr-review

# === PERMISSIONS (optional) ===
# Enforced by the Capability Proxy. If omitted, runtime default applies
# (see Section 7.3 for fail-open/fail-closed policy).
permissions:
  tools:                                   # map<string, map<string, "allow"|"deny">>
    github:
      get_pull_request: allow
      create_review: allow
      merge_pull_request: deny
  data:                                    # map<string, "read-only"|"read-write"|"never">
    repo_contents: read-only
    review_comments: read-write

# === BEHAVIORAL (required for type: capability) ===
behavioral:
  core: |                                  # string, the irreducible instructions
    When reviewing a PR:
    1. Always check CI status first
    2. Review the diff file-by-file
    3. Prioritize: security > correctness > performance > style
    4. Flag breaking changes explicitly
    5. Provide actionable suggestions, not vague complaints
  overlays:                                # Overlay[]
    - ref: team-tone-guide                 # string, reference name
      optional: true
      priority: 10                         # integer, higher = applied later = wins conflicts

# === STATE SCHEMA (optional) ===
# Fields preserved when this capability is evicted mid-task.
# See Section 7.4 for lifecycle rules.
state_schema:
  version: 1                               # integer, for migration on schema changes
  max_size_tokens: 500                     # integer, budget for serialized state
  fields:
    - name: target_pr                      # string, field name
      type: string                         # enum: "string"|"number"|"boolean"|"string[]"|"object"|"object[]"
    - name: files_reviewed
      type: string[]
    - name: findings
      type: object[]

# === VERIFICATION (optional) ===
verification:
  checklist:                               # string[]
    - "Inspected the diff"
    - "Checked CI/test status"
    - "Reviewed changed files list"
    - "Assessed security implications"
  completion_signal: structured_review_output   # string, what signals the capability is done
```

### 4.2 Multi-Resolution Context (LOD System)

Every capability exists at four fidelity levels, inspired by Level-of-Detail systems in 3D graphics:

| Level | Content | Typical Size | When Loaded |
|-------|---------|-------------|-------------|
| **Index** | Name + one-line description | ~15 tokens | Always resident in capability registry |
| **Summary** | Key info, activation triggers, provides tags | ~200 tokens | When potentially relevant to current task |
| **Standard** | Full behavioral core + tool bindings + verification | ~2K tokens | When actively being used |
| **Deep** | Standard + examples + reference docs + edge cases | ~5K tokens | Complex tasks, first-time use, explicit request |

**Inclusivity rule:** Each level INCLUDES all content from lower levels. Standard contains everything in Summary. Deep contains everything in Standard. Budget accounting uses the single highest mounted level — you never pay for multiple levels simultaneously. Files are maintained separately for authoring convenience, but the runtime loads only one file per capability at any time.

**File structure:**

```
github-pr-review/
├── capability.yaml          # manifest (required)
├── index.txt                # ~15 tokens (required)
├── summary.md               # ~200 tokens (required)
├── standard.md              # ~2K tokens (required for type: capability)
├── deep.md                  # ~5K tokens (optional)
├── references/              # optional supporting docs
│   ├── review-rubric.md
│   └── security-checklist.md
└── scripts/                 # optional automation
    └── verify-ci.sh
```

### 4.3 Behavioral Architecture

Capability behavior is split into three concern layers:

**Core** — The irreducible instructions for doing the task. Small, stable, always included at standard resolution and above.

**Overlays** — Context-specific modifiers that compose on top of the core. Overlays have explicit integer priority values. When overlays conflict, higher priority wins. If two overlays have equal priority, the one declared later in the manifest wins. Examples: tone guides, company conventions, regulatory requirements.

**Adapters** — Bindings to actual tools and data sources. The capability declares what it needs; adapters satisfy that need with concrete implementations. This is the driver model for agent tooling.

---

## 5. Capability Sets

A **Capability Set** is a curated bundle of capabilities for a domain. It uses the same manifest format with `type: capability-set`. Capability sets MUST NOT define `behavioral` sections — they are pure composition.

```yaml
name: engineering.code-change
type: capability-set
version: 1.0.0
description: "Full code change lifecycle — branch, implement, test, review, merge"

provides:
  - code-change-lifecycle

requires:
  capabilities:
    - name: git-basics
      resolution: standard
    - name: github-pr-review
      resolution: standard
    - name: test-runner
      resolution: standard
    - name: lint-fix
      resolution: summary
    - name: ci-verify
      resolution: summary

budget:
  index: 20
  summary: 100
  standard: 0                # capability sets don't have their own standard/deep content
  deep: 0
  children_total: 8000       # total budget for all child capabilities combined
  overflow_policy: demote_lowest_priority
```

**Budget math (worked example):**

| Capability | Resolution | Budget |
|-----------|-----------|--------|
| git-basics | standard | 1800 |
| github-pr-review | standard | 1800 |
| test-runner | standard | 1800 |
| lint-fix | summary | 200 |
| ci-verify | summary | 200 |
| **Total** | | **5800** |
| **Remaining flex** | | **2200** |

If github-pr-review escalates to deep (+3700 over standard = 5500 total), the total becomes 9500, exceeding children_total by 1500. The `overflow_policy: demote_lowest_priority` triggers: `lint-fix` and `ci-verify` are already at summary. Next lowest priority is `test-runner`, which demotes from standard (1800) to summary (200), freeing 1600 tokens. New total: 7900 — within budget.

If demotion cannot free enough tokens, the runtime raises `BUDGET_OVERFLOW` and the agent or human must decide.

---

## 6. Roles

A **Role** is a policy-and-persona lens over one or more capability sets. Roles define *who the agent is* and *how it operates*, not detailed procedures for each task.

```yaml
name: staff-engineer
version: 1.0.0
description: "Senior technical contributor with broad system awareness"

compose:
  capability_sets:
    - name: engineering.code-change
      priority: high               # enum: "critical"|"high"|"medium"|"low"
    - name: engineering.infrastructure
      priority: medium
    - name: engineering.documentation
      priority: low

policy:
  priorities:
    - reliability > velocity
    - security > convenience
  escalation:
    - condition: "security vulnerability found"
      action: notify_human
    - condition: "production deployment"
      action: require_approval
  tone: "Direct, technical, opinionated but open to pushback"

budget:
  total: 12000
  reserved:
    identity: 500               # role policy text
    active_capabilities: 6000   # hot zone
    standby_summaries: 1000     # warm zone
    flex: 4500                  # available for deep-loading on demand

memory:
  retrieval_limit: 5
```

### Role Inheritance

```
Base Identity (agent personality / system prompt)
  → Persistent Role (staff-engineer)
    → Task Role (pr-reviewer, optional temporary overlay)
      → Active Capability (github-pr-review)
```

Each layer can override or extend the previous. Always-on agents have persistent Roles. Ephemeral workers get a Role + task assignment and terminate after output.

---

## 7. Runtime: Context Manager

The runtime has three subsystems and a state persistence layer.

### 7.1 The Resolver (Composition-Time)

Runs at session start or task start:

1. **Dependency Resolution** — Walk the dependency graph from Role → Capability Sets → Capabilities. Resolve transitive dependencies. Topological sort for load order.

2. **Conflict Detection** — If two capabilities share `provides` tags (e.g., `github-pr-review` and `gitlab-mr-review` both provide `code-review`), raise `CONFLICT` error. Session Policies can resolve conflicts by specifying preferred implementations.

3. **Dependency Cascade Budgeting** — When `requires` and `co_activates` trigger chains, the resolver calculates the total transitive budget BEFORE mounting anything. If the chain exceeds the available budget, the resolver applies `overflow_policy` iteratively until the budget fits or raises `BUDGET_OVERFLOW`.

4. **Budget Fitting** — Bin-packing algorithm. Inputs: context window size, role budget allocation, resolved capabilities with their budgets. Algorithm:
   - Start all capabilities at their declared resolution (from capability set or default: standard)
   - If total exceeds budget: demote capabilities by priority (low → medium → high → critical), reducing resolution one level at a time
   - Never demote below index
   - If budget still exceeds after all non-critical capabilities are at index: raise `BUDGET_OVERFLOW`

5. **Resolved Context Output** — Produce a ready-to-inject prompt with all resolved capabilities at their allocated resolution levels.

### 7.2 The Loader (Runtime Context Management)

Manages dynamic context during agent execution.

**Context Zones:**

```
┌──────────────────────────────────┐
│  RESIDENT (always loaded)        │
│  - Agent identity / personality  │
│  - Capability registry (all idx) │
│  - Active Role policy            │
│  - Current objective             │
├──────────────────────────────────┤
│  HOT (standard/deep resolution)  │
│  - Currently active capability   │
│  - Its required tool bindings    │
├──────────────────────────────────┤
│  WARM (summary resolution)       │
│  - Recently used capabilities    │
│  - Standby capabilities from role│
├──────────────────────────────────┤
│  COLD (index only)               │
│  - Everything else               │
│  - Mounted on demand             │
├──────────────────────────────────┤
│  CONVERSATION HISTORY            │
│  - Compresses oldest first       │
└──────────────────────────────────┘
```

**Dynamic Mounting** — When the agent needs a capability currently at index/summary:
1. Runtime detects need (see Mount Precedence below)
2. Mounts the capability at standard (or deep if explicitly requested)
3. Serializes state of evicted capabilities (see Section 7.4)
4. Demotes least-recently-used capabilities via LRU to free budget
5. Resumes agent execution with new context

**Mount Precedence Rules:**

The runtime supports both automatic mounting (via activation triggers) and explicit mounting (agent calls `capabilities.mount()`). When they conflict:

| Scenario | Resolution |
|----------|-----------|
| Agent calls `mount(X)` | Always honored. X is mounted. |
| Agent calls `unmount(X)` while trigger is active | Agent wins. X is unmounted. Trigger is suppressed for this session until agent calls `mount(X)` again or a new trigger fires. |
| Trigger fires for X while agent has explicitly unmounted X | Trigger is suppressed. Agent's explicit decision takes precedence. |
| Trigger fires for X, no explicit agent action | X is automatically mounted at standard resolution. |
| Two triggers fire simultaneously for conflicting capabilities | First trigger wins (by declaration order in registry). Second raises `CONFLICT`. |

**Principle:** Explicit agent actions always override automatic triggers. The agent is sovereign over its own context.

### 7.3 The Capability Proxy (Enforcement)

A proxy layer between the agent and the tool router that enforces capability permissions:

```
Agent → [Capability Proxy] → Tool Router → MCP Servers
```

**Enforcement flow:**
1. Agent makes a tool call
2. Proxy identifies the currently active capability
3. Proxy checks the capability's `permissions` block for this tool + method
4. If allowed: forward to tool router
5. If denied: return structured denial (see below)
6. If no permissions block exists: apply default policy

**Default policy: FAIL-OPEN with logging.**

Rationale: Most early capabilities won't have full permission blocks. Blocking all unpermissioned tool calls would break backward compatibility and adoption. The runtime MUST log all unpermissioned tool calls for audit. Implementations SHOULD provide a configuration flag to switch to fail-closed when the ecosystem matures.

```
default_permission_policy: allow-with-log    # "allow-with-log" | "deny"
```

**Structured denial response:**
```json
{
  "denied": true,
  "capability": "github-pr-review",
  "tool": "github",
  "method": "merge_pull_request",
  "reason": "Merge requires human approval.",
  "escalation": "notify_human",
  "alternatives": ["capabilities.escalate('github', 'merge_pull_request', 'PR ready for merge')"]
}
```

**Session Policies** constrain capabilities and permissions per session type:

```yaml
name: contractor-session
description: "Restricted session for external contractors"

resolution:
  code-review: github-pr-review
  deploy: null                       # deny all deploy capabilities
  database: supabase-readonly

permissions_override:
  github:
    merge_pull_request: deny
    delete_branch: deny

default_permission_policy: deny      # override to fail-closed for this session
```

Session Policies are applied by the Resolver at composition-time and enforced by the Proxy at runtime.

### 7.4 State Persistence Lifecycle

When a capability is evicted from HOT to WARM/COLD, its working state must be preserved if a `state_schema` is defined.

**Storage:** Serialized state is stored in an **external state store** (not in the context window). The store is keyed by `{session_id, capability_name, capability_version}`. Implementations may use files, key-value stores, or in-memory maps — the spec does not mandate a storage backend.

**Size constraints:** Serialized state MUST NOT exceed the `max_size_tokens` declared in `state_schema`. If serialization would exceed the limit, the runtime truncates fields in reverse declaration order (last declared field dropped first) and logs a warning.

**Lifecycle:**

```
MOUNT → capability is active, state accumulates in conversation
  │
  ▼
EVICT → runtime extracts state_schema fields from conversation context
  │      serializes to external store
  │      drops capability to WARM/COLD
  ▼
RE-MOUNT → runtime loads state from external store
  │         injects as "Prior state:" block above capability instructions
  │         capability resumes with context
  ▼
VERSION MISMATCH → state_schema.version in store ≠ mounted capability version
  │                 runtime discards state, fires STATE_LOST warning
  │                 capability mounts clean (no prior state)
  ▼
SESSION END → all state for this session is discarded
              (no cross-session state persistence by default)
```

**State extraction:** The runtime SHOULD use structured extraction (parsing known field names from the conversation) when possible. If structured extraction fails, the runtime MAY use LLM-assisted summarization as a fallback, subject to the `max_size_tokens` budget.

---

## 8. Error Model

### 8.1 Resolution Errors (composition-time)

| Error Code | Cause | Resolution |
|-----------|-------|------------|
| `DEPENDENCY_MISSING` | Required capability or tool not available | If `optional: true`, proceed without. If required, fail with message listing missing dependencies and installation instructions. |
| `CONFLICT` | Two capabilities share `provides` tags with no preference rule | Fail with conflict details. Session Policy or human must choose. Include both capability names and their provides tags. |
| `BUDGET_OVERFLOW` | Total resolved budget exceeds context window after all demotions | Report: total required, available budget, list of capabilities and their minimum resolution levels. Agent or human must remove capabilities or increase window. |
| `TOOL_UNAVAILABLE` | MCP server unreachable at resolution time | If `optional: true`, proceed. If required, fail with connection details, last-known status, and retry suggestion. |

### 8.2 Runtime Errors

| Error Code | Cause | Resolution |
|-----------|-------|------------|
| `MOUNT_FAILED` | Dynamic mount requested but budget cannot accommodate | Return: requested capability, budget needed, current budget usage, suggested demotions. Agent or human decides. |
| `PERMISSION_DENIED` | Tool call blocked by Capability Proxy | Return structured denial with escalation path and alternatives. |
| `STATE_LOST` | Capability re-mounted but state not found, corrupted, or version mismatch | Mount clean (no prior state). Warn agent: "Prior working state unavailable. You may need to re-examine [state fields]." |
| `TOOL_ERROR` | MCP tool call fails at runtime | Return tool error details. If capability manifest defines a `fallback` tool binding, suggest it. |
| `VERIFICATION_FAILED` | Capability's completion checklist not satisfied at completion_signal | Warn agent with unchecked items. Do not mark capability task as complete. |

### 8.3 Degradation Strategy

When errors occur, the runtime follows this priority chain:

1. **Use fallback** — if the manifest defines alternative tool bindings or capabilities
2. **Demote gracefully** — reduce resolution level, drop optional dependencies
3. **Inform the agent** — structured error with suggested actions
4. **Escalate to human** — if no automated resolution is possible

---

## 9. Agent-Facing API

The runtime exposes a standard API surface. Framework implementers map these to their tool/function calling conventions.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `capabilities.registry()` | none | `RegistryEntry[]` | List all available capabilities at index level |
| `capabilities.mounted()` | none | `MountedCapability[]` | List mounted capabilities with resolution level and budget usage |
| `capabilities.mount(name, resolution?)` | `name: string`, `resolution?: "summary"\|"standard"\|"deep"` (default: "standard") | `MountResult \| MountError` | Mount a capability. May trigger demotions. |
| `capabilities.unmount(name)` | `name: string` | `UnmountResult` | Demote to index, serialize state. Suppresses auto-triggers. |
| `capabilities.status(name)` | `name: string` | `CapabilityStatus` | Current resolution, state presence, budget usage, permissions summary |
| `capabilities.escalate(tool, method, reason)` | `tool: string`, `method: string`, `reason: string` | `EscalationResult` | Request human approval for a denied action |

**Escalation contract:**

When `capabilities.escalate()` is called:
1. Runtime sends the escalation request to the human via the agent framework's notification mechanism (implementation-specific: chat message, push notification, email, etc.)
2. Execution pauses for the escalated action (agent may continue other work)
3. Human responds: `approve`, `deny`, or `approve-once`
4. Result is returned to the agent:
   ```json
   {
     "escalation_id": "esc_abc123",
     "tool": "github",
     "method": "merge_pull_request",
     "decision": "approve-once",
     "decided_by": "human",
     "note": "Looks good, merge it"
   }
   ```
5. If `approve` or `approve-once`: the proxy permits the tool call. `approve-once` does not update the capability's permission block.

---

## 10. Migration from Existing Skills

ACR MUST coexist with existing skill formats to enable adoption.

### 10.1 Migration Strategy

1. **Existing skill files become `standard.md`** — Current skill formats map directly to the standard resolution level.

2. **Scaffold tool generates manifests:**
   ```bash
   acr migrate ./my-skill/SKILL.md
   # Generates: capability.yaml, index.txt, summary.md
   # Copies SKILL.md → standard.md
   # index.txt: auto-generated from first line/description
   # summary.md: auto-generated via LLM or template
   ```

3. **Backward compatibility** — Capabilities without a manifest fall back to legacy behavior:
   - Loaded as-is at a single resolution level
   - No dependency resolution, no budget management, no permission scoping
   - Runtime treats them as: `type: capability`, `budget.standard: <actual token count>`, `provides: [<filename>]`

4. **Progressive enhancement** — Teams add capability.yaml manifests incrementally. Each manifest unlocks: dependency resolution, multi-resolution loading, budget management, and permission scoping.

### 10.2 Framework Mapping

| Existing Format | Maps To |
|----------------|---------|
| SKILL.md (various frameworks) | standard.md |
| .cursorrules / rules files | behavioral core + overlays |
| Claude project instructions | Role policy + capability cores |
| Custom prompt libraries | Reference docs + instruction primitives |
| MCP server configs | Tool binding primitives |

### 10.3 Timeline

- **Phase 1-2:** Capabilities and legacy skills coexist. Runtime supports both.
- **Phase 3:** Legacy skills generate deprecation warnings.
- **Phase 4+:** Legacy skill support becomes optional for runtime implementers.

---

## 11. Activation Trigger Evaluation

Triggers are evaluated by the runtime's **trigger evaluator** subsystem. The trigger system is defined as an abstract interface to allow multiple implementation strategies.

### Trigger Types

A conforming implementation MUST support at least one trigger type. Three trigger types are defined:

**Pattern triggers** (`type: pattern`) — Evaluated against the current user message using regex matching. The runtime MUST precompile patterns at registration time. Pattern triggers SHOULD be the fastest evaluation path.

**Semantic triggers** (`type: semantic`) — Evaluated against user messages using text similarity. Implementations MAY use TF-IDF cosine similarity, dense vector embeddings, BM25, or any other similarity measure. The runtime SHOULD define a configurable similarity threshold (RECOMMENDED default: 0.3).

**Runtime event triggers** (`type: runtime_event`) — Evaluated against system state (tool availability, session type, time-based conditions). These MUST be checked at session start and SHOULD be re-checked when system state changes.

### Trigger Evaluator Interface

A conforming trigger evaluator MUST implement:
- `register(manifest)` — Register a capability's triggers for evaluation
- `evaluate(input, runtimeState?) → TriggerMatch[]` — Evaluate all triggers against input

The evaluator MUST be stateless — concurrent calls to `evaluate()` MUST produce consistent results.

### Evaluation Strategy

- Pattern triggers SHOULD be evaluated first (fast-path)
- Semantic triggers SHOULD be evaluated only when no pattern triggers match (fallback)
- The runtime SHOULD short-circuit on first match for OR-logic triggers
- For registries with 100+ capabilities, the runtime SHOULD batch evaluation and bound latency

### Trigger Evaluation Frequency
- Pattern and semantic triggers: once per user message
- Runtime event triggers: on state change only
- Cost: O(n) where n = number of inactive capabilities with triggers

---

## 12. Ecosystem & Distribution

### Package Format

Capabilities are distributed as packages through any compatible registry:

```
github-pr-review/
├── capability.yaml          # required
├── index.txt                # required
├── summary.md               # required
├── standard.md              # required for type: capability
├── deep.md                  # optional
├── references/              # optional
├── scripts/                 # optional
└── tests/                   # optional
```

### Registry Operations

Any ACR-compatible registry SHOULD support:

```bash
acr install <name>                    # Install a capability
acr search --provides <tag>           # Search by provides tags
acr publish <path>                    # Publish a capability
acr validate <path>                   # Validate manifest against schema
acr migrate <skill-file>              # Generate capability from existing skill
acr budget <role-or-set>              # Calculate total budget for a composition
```

### Versioning

- Capabilities use semver
- Breaking changes: removing provides tags, adding required dependencies, changing state_schema in incompatible ways → major version bump
- Roles and capability sets can pin versions via lockfiles for reproducible compositions

---

## 13. Implementation Roadmap

### Phase 1: Manifests + Migration (2-4 weeks)
- Publish `capability.yaml` JSON Schema for validation
- Build `acr migrate` scaffold tool
- Build dependency graph resolver
- Build budget calculator (`acr budget`)
- Backward compatibility layer for legacy skills
- Reference implementation: migrate 5 existing skills to validate the format

### Phase 2: Multi-Resolution Loading (2-3 weeks)
- Build LOD loader (select resolution based on budget)
- Implement dynamic mounting (summary → standard on activation)
- Implement state serialization/deserialization
- Build trigger evaluator with regex precompilation
- Trigger index and short-circuit evaluation

### Phase 3: Composition + Enforcement (3-4 weeks)
- Capability set and role schema validation
- Full resolver (dependency resolution + conflict detection + cascade budgeting + bin-packing)
- Runtime loader (context zones + LRU working set management)
- Capability Proxy (permission enforcement + fail-open logging)
- Session Policies (resolution + permission overrides)
- Error model implementation (all error codes + degradation strategy)

### Phase 4: Ecosystem + Tooling (2-3 weeks)
- Package format specification (formal)
- Registry protocol (publish, install, search, validate)
- CLI tooling (`acr` command suite)
- Documentation, tutorials, and adoption guide
- Reference implementations for 2+ agent frameworks

---

## 14. Concurrency Model

### Single-Agent Concurrency

An ACR runtime MUST be safe for sequential access within a single agent session. Concurrent mount/unmount operations within the same session SHOULD be serialized.

When an agent issues parallel tool calls:
- The context snapshot MUST remain consistent for the duration of all parallel calls
- Mount/unmount operations triggered by parallel tool responses SHOULD be queued and processed sequentially
- State updates from parallel operations MUST NOT corrupt shared capability state

### Multi-Agent Sessions

When multiple agents share a capability registry:
- Each agent MUST maintain its own `ContextManager` instance
- Capability manifests MAY be shared (read-only)
- State MUST be isolated per session ID
- The `StateStore` interface MUST support concurrent access from multiple sessions

### Spawn Inheritance

When a parent agent spawns a child agent:
- **Role**: MUST NOT be inherited (child is a separate agent identity)
- **Capabilities**: MUST be explicitly declared by the parent
- **Session policies**: SHOULD be inherited unless overridden
- **State**: MUST NOT be inherited (clean context is the purpose of delegation)
- **Budget**: MAY be smaller than the parent's window

### Thread Safety Requirements

Implementations targeting multi-threaded runtimes:
- `ContextManager.mount()` and `unmount()` MUST be atomic with respect to budget accounting
- `StateStore.save()` and `load()` MUST be safe for concurrent access across sessions
- `TriggerEngine.evaluate()` MAY be called concurrently and MUST be stateless

---

## 15. Future Extensions

Deferred from initial spec. Each includes a concrete trigger for when to revisit.

### Capability Interfaces (Trait System)
Abstract contracts that capabilities implement, enabling polymorphism and swappable backends.
**Revisit when:** 50+ published capabilities exist AND 3+ competing implementations share the same `provides` tag.

### Workflows (Capability Scheduling)
Stateful orchestration scheduling capabilities over time with phase-based mount/demote directives.
**Revisit when:** Empirical evidence shows agent self-orchestration fails at multi-phase tasks that span 10+ capability switches.

### Context Compaction
Compressing a capability from standard to a task-aware summary mid-conversation.
**Revisit when:** Eviction-and-remount proves too expensive (>30% of tasks require re-mounting the same capability within a single session).

### Cross-Agent Capability Sharing
Enabling multi-agent systems to share capability state and mounted context.
**Revisit when:** Multi-agent orchestration becomes a primary use case for ACR adopters.

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| **Primitive** | A raw, reusable building block (instruction, doc, tool binding, script, evaluator, memory source) |
| **Capability** | The core unit of composition — a manifest-driven bundle binding behavior, tools, context, and policy |
| **Capability Set** | A curated bundle of capabilities for a domain (`type: capability-set`) |
| **Role** | A policy-and-persona lens over capability sets defining agent identity and behavior |
| **Session Policy** | Runtime configuration scoping capability resolution and permissions per session type |
| **Resolution Level** | The fidelity at which a capability is loaded: index, summary, standard, or deep |
| **Dynamic Mounting** | Loading a capability from a lower resolution to a higher one at runtime |
| **Capability Proxy** | Enforcement layer between agent and tool router that validates permissions |
| **Context Zone** | A region of the context window with defined residency rules (resident, hot, warm, cold) |
| **Adapter** | A concrete tool binding satisfying an abstract capability requirement |
| **Overlay** | A composable behavioral modifier with explicit integer priority |
| **Core** | The irreducible behavioral instructions for a capability |
| **Trigger Index** | Precompiled map of activation triggers for efficient evaluation |

---

## 16. Design Influences

| Domain | Pattern | Application in ACR |
|--------|---------|-------------------|
| **OS Virtual Memory** | Page tables, working sets, demand paging | Context zones, dynamic mounting, LRU eviction |
| **Dynamic Linking** | Symbol resolution, shared libraries | Dependency resolution, provides/requires |
| **3D Graphics** | Level of Detail (LOD) | Multi-resolution context (index/summary/standard/deep) |
| **Scope-Restricted Security** | Scoped access tokens, sandboxed runtimes | Session Policies, Capability Proxy, per-capability permissions |
| **Package Managers** | Dependency graphs, semver, lockfiles | Capability manifests, versioning, reproducible compositions |
| **CSS** | Cascading specificity, composable layers | Overlay priority system for behavioral modifiers |
| **CPU Architecture** | Cache hierarchy (L1/L2/L3) | Context zones (resident/hot/warm/cold) |

---

*This specification synthesizes independent analyses from Gemini 3.1 Pro, GPT 5.4, and Claude Opus 4.6, refined through two review rounds. Framework-agnostic by design.*

*© 2026 heybeaux.dev — Open specification, free to implement.*
