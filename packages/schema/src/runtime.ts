/**
 * ACR Runtime Types — Phase 2
 * Context Manager, Loader, Trigger Engine, State Persistence
 */

import type {
  CapabilityManifest,
  ResolutionLevel,
  ResolutionPlan,
  ResolvedCapability,
  ACRErrorCode,
  PermissionValue,
  StateField,
} from './types.js';

// ─── Context Zones ───────────────────────────────────────────────────

export type ContextZone = 'RESIDENT' | 'HOT' | 'WARM' | 'COLD';

export interface MountedCapability {
  manifest: CapabilityManifest;
  resolution: ResolutionLevel;
  zone: ContextZone;
  budgetUsed: number;
  mountedAt: number;             // timestamp
  lastAccessedAt: number;        // for LRU
  suppressedTriggers: boolean;   // agent explicitly unmounted → triggers suppressed
  state?: SerializedState;       // restored state from prior mount
}

export interface RegistryEntry {
  name: string;
  version: string;
  type: CapabilityManifest['type'];
  description: string;
  provides: string[];
  zone: ContextZone;
  resolution: ResolutionLevel;
  budgetUsed: number;
}

// ─── Mount / Unmount ─────────────────────────────────────────────────

export interface MountResult {
  success: true;
  capability: string;
  resolution: ResolutionLevel;
  zone: ContextZone;
  budgetUsed: number;
  demotions: Demotion[];
  restoredState: boolean;
}

export interface MountError {
  success: false;
  code: ACRErrorCode;
  capability: string;
  message: string;
  budgetNeeded: number;
  budgetAvailable: number;
  suggestedDemotions: Demotion[];
}

export interface UnmountResult {
  capability: string;
  previousResolution: ResolutionLevel;
  stateSerialized: boolean;
  triggersSuppressed: boolean;
}

export interface Demotion {
  capability: string;
  from: ResolutionLevel;
  to: ResolutionLevel;
  tokensSaved: number;
}

// ─── Capability Status ───────────────────────────────────────────────

export interface CapabilityStatus {
  name: string;
  zone: ContextZone;
  resolution: ResolutionLevel;
  budgetUsed: number;
  hasState: boolean;
  stateVersion?: number;
  permissions: Record<string, Record<string, PermissionValue>>;
  triggersActive: boolean;
  triggersSuppressed: boolean;
}

// ─── State Persistence ───────────────────────────────────────────────

export interface SerializedState {
  capabilityName: string;
  capabilityVersion: string;
  schemaVersion: number;
  fields: Record<string, unknown>;
  serializedAt: number;
  tokenCount: number;
}

export interface StateStore {
  save(sessionId: string, state: SerializedState): Promise<void>;
  load(sessionId: string, capabilityName: string, capabilityVersion: string): Promise<SerializedState | null>;
  delete(sessionId: string, capabilityName: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

// ─── Trigger Engine ──────────────────────────────────────────────────

export interface CompiledTrigger {
  capabilityName: string;
  type: 'pattern' | 'runtime_event';
  regex?: RegExp;               // precompiled for pattern triggers
  condition?: string;           // raw expression for runtime_event triggers
  triggerLogic: 'OR' | 'AND';
  allTriggers: CompiledTrigger[]; // siblings for AND logic
}

export interface TriggerMatch {
  capabilityName: string;
  triggerType: 'pattern' | 'runtime_event';
  matchedText?: string;
  condition?: string;
}

export interface RuntimeState {
  availableTools: string[];
  sessionType?: string;
  customState: Record<string, unknown>;
}

// ─── Capability Proxy ────────────────────────────────────────────────

export type DefaultPermissionPolicy = 'allow-with-log' | 'deny';

export interface ProxyDecision {
  allowed: boolean;
  capability: string;
  tool: string;
  method: string;
  reason?: string;
  escalation?: string;
  alternatives?: string[];
  logged: boolean;
}

export interface EscalationRequest {
  id: string;
  capability: string;
  tool: string;
  method: string;
  reason: string;
  requestedAt: number;
}

export type EscalationDecision = 'approve' | 'deny' | 'approve-once';

export interface EscalationResult {
  id: string;
  tool: string;
  method: string;
  decision: EscalationDecision;
  decidedBy: 'human' | 'policy';
  note?: string;
}

// ─── Context Manager (top-level orchestrator) ────────────────────────

export interface ContextManagerConfig {
  windowSize: number;
  residentBudget: number;         // tokens reserved for identity, registry, policy
  defaultPermissionPolicy: DefaultPermissionPolicy;
  sessionId: string;
  stateStore?: StateStore;
}

export interface ContextSnapshot {
  sessionId: string;
  windowSize: number;
  residentBudget: number;
  budgetUsed: number;
  budgetAvailable: number;
  utilization: number;
  capabilities: RegistryEntry[];
  hotCount: number;
  warmCount: number;
  coldCount: number;
}

// ─── Events (for framework integration) ──────────────────────────────

export type ACREventType =
  | 'capability:mounted'
  | 'capability:unmounted'
  | 'capability:demoted'
  | 'capability:promoted'
  | 'trigger:matched'
  | 'trigger:suppressed'
  | 'state:saved'
  | 'state:restored'
  | 'state:lost'
  | 'permission:denied'
  | 'permission:logged'
  | 'escalation:requested'
  | 'escalation:resolved'
  | 'budget:warning'
  | 'budget:overflow';

export interface ACREvent {
  type: ACREventType;
  timestamp: number;
  capability?: string;
  details: Record<string, unknown>;
}

export type ACREventHandler = (event: ACREvent) => void;
