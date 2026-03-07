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
