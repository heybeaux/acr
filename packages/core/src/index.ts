// Phase 1 — Schema & CLI tools
export { validateCapability, type ValidationResult, type ValidationError, type ValidationWarning } from './validator.js';
export { resolve, type ResolverOptions } from './resolver.js';
export { calculateBudget, type BudgetReport, type CapabilityBudgetEntry, type BurstScenario } from './budget.js';
export { migrateSkill, type MigrationResult } from './migrate.js';
export { detectLegacy, scanCapabilities, type LegacyDetectionResult } from './legacy.js';

// Phase 2 — Runtime
export { ContextManager } from './context-manager.js';
export { TriggerEngine } from './trigger-engine.js';
export { CapabilityProxy } from './capability-proxy.js';
export { InMemoryStateStore, serializeState, formatStateForContext } from './state-store.js';
export { LODLoader, renderPersona, type LoadedCapability } from './loader.js';
export { applySessionPolicy, checkCapabilityPolicy, getEffectivePermission, type SessionPolicy, type PolicyResult } from './session-policy.js';
export { AgentAPI, type AgentAPIConfig } from './agent-api.js';
export { countTokens, estimateTokensWordBased, countTokensSafe } from './tokenizer.js';
export { TaskResolver, type TaskResolution, type TaskCapability, type TaskResolverConfig } from './task-resolver.js';
export { FileStateStore, type FileStateStoreConfig } from './file-state-store.js';
export { Observer, createEvent, type ObservabilityConfig, type SessionMetrics } from './observability.js';
export { lintCapability, formatLintResults, type LintResult, type LintIssue } from './linter.js';
export { buildIndex, saveIndex, loadIndex, searchRegistry, formatSearchResults, type RegistryIndex, type SearchResult } from './registry.js';
export { resolveSpawnConfig, resolveFromTask, type SpawnCapabilityRequest, type SpawnConfig } from './spawn-resolver.js';
export { resolveCapabilitySet, resolveRole, type CapabilitySetDefinition, type RoleDefinition, type CapabilitySetMember } from './capability-sets.js';
export { ACRTestKit, type MockCapabilityOptions, type MountAssertion, type ResolutionAssertion } from './testkit.js';
export type { ModelPreferenceMap } from './task-resolver.js';

// Adapters
export {
  OpenClawAdapter,
  type OpenClawAdapterConfig,
  type SkillLoadResult,
  type TurnResult,
} from './adapters/openclaw.js';
