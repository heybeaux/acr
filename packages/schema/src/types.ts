/**
 * ACR Capability Manifest Types
 * Generated from the ACR v1.0-draft specification
 */

export type ResolutionLevel = 'index' | 'summary' | 'standard' | 'deep';
export type CapabilityType = 'capability' | 'capability-set';
export type TriggerType = 'pattern' | 'runtime_event' | 'semantic';
export type TriggerLogic = 'OR' | 'AND';
export type PermissionValue = 'allow' | 'deny';
export type DataPermission = 'read-only' | 'read-write' | 'never';
export type OverflowPolicy = 'demote_lowest_priority' | 'error' | 'request_human';
export type StateFieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'object' | 'object[]';
export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';
export type ModelConstraint = 'requires-image-gen' | 'requires-vision' | 'requires-reasoning' | 'requires-code-exec' | 'requires-long-context';

export interface ModelPreference {
  preferred?: string;         // Provider/model ID (e.g., "google/gemini-2.5-pro")
  fallback?: string | null;   // Fallback model if preferred unavailable
  constraint?: ModelConstraint; // Hard requirement tag
}

export interface ToolRequirement {
  mcp: string;
  methods?: string[];
  optional?: boolean;
}

export interface CapabilityRequirement {
  name: string;
  resolution?: ResolutionLevel;
  optional?: boolean;
}

export interface ContextRequirement {
  ref: string;
  optional?: boolean;
}

export interface Trigger {
  type: TriggerType;
  match?: string;      // required when type === 'pattern'
  condition?: string;  // required when type === 'runtime_event'
  threshold?: number;  // similarity threshold for type === 'semantic' (0-1, default 0.6)
}

export interface Overlay {
  ref: string;
  optional?: boolean;
  priority?: number;
}

export interface StateField {
  name: string;
  type: StateFieldType;
}

export interface Budget {
  index: number;
  summary: number;
  standard: number;
  deep?: number;
  children_total?: number;
  overflow_policy?: OverflowPolicy;
}

export interface Activation {
  triggers?: Trigger[];
  trigger_logic?: TriggerLogic;
  co_activates?: string[];
  conflicts?: string[];
}

export interface Permissions {
  tools?: Record<string, Record<string, PermissionValue>>;
  data?: Record<string, DataPermission>;
}

export interface Behavioral {
  core: string;
  overlays?: Overlay[];
}

export interface Persona {
  identity?: string;
  voice?: string;
  values?: string[];
  do?: string[];
  dont?: string[];
  relationship?: string;
}

export interface StateSchema {
  version: number;
  max_size_tokens: number;
  fields: StateField[];
}

export interface Verification {
  checklist?: string[];
  completion_signal?: string;
}

// ─── Marketplace / Registry ──────────────────────────────────────────

export type CompensationModel = 'free' | 'per-use' | 'subscription' | 'donation' | 'token-gated';

export interface FundingConfig {
  model: CompensationModel;
  wallet?: string;          // Payment address (ETH, Lightning, etc.)
  token_id?: string;        // On-chain token identifier (ERC-1155 token ID)
  contract?: string;        // Smart contract address
  chain?: string;           // Blockchain network (ethereum, polygon, base, etc.)
}

export interface Publisher {
  author?: string;          // DID, wallet address, email, or URI
  organization?: string;    // Publishing org or team
  license?: string;         // SPDX identifier (MIT, Apache-2.0, LicenseRef-PerUse)
  repository?: string;      // Source repo URL
  content_hash?: string;    // SHA-256 or IPFS CID of capability content
  signature?: string;       // Cryptographic signature of content_hash
  registry_uri?: string;    // Canonical registry location
  funding?: FundingConfig;  // Compensation metadata
}

/**
 * The complete ACR Capability Manifest.
 * This is the root type for capability.yaml files.
 */
export interface CapabilityManifest {
  name: string;
  version: string;
  type: CapabilityType;
  description: string;
  provides: string[];

  requires?: {
    tools?: ToolRequirement[];
    capabilities?: CapabilityRequirement[];
    context?: ContextRequirement[];
  };

  budget: Budget;
  activation?: Activation;
  permissions?: Permissions;
  behavioral?: Behavioral;       // required for type: 'capability'
  persona?: Persona;
  state_schema?: StateSchema;
  verification?: Verification;
  constraints?: string[];        // hard rules that MUST be followed — surfaced at summary LOD or higher
  file_patterns?: string[];      // file extensions/globs that boost this capability's priority (e.g., '.stories.tsx', '.test.ts')
  priority?: PriorityLevel;      // eviction priority (default: 'medium')
  publisher?: Publisher;          // authorship, integrity, and marketplace metadata
  model?: ModelPreference;        // preferred model routing for this capability
}

/**
 * Resolved capability with computed metadata from the resolver.
 */
export interface ResolvedCapability {
  manifest: CapabilityManifest;
  resolution: ResolutionLevel;
  loadOrder: number;
  transitiveDependencies: string[];
  budgetUsed: number;
}

/**
 * Resolution plan output from the resolver.
 */
export interface ResolutionPlan {
  capabilities: ResolvedCapability[];
  totalBudget: number;
  windowSize: number;
  utilization: number;  // 0-1
  conflicts: ConflictError[];
  warnings: string[];
}

/**
 * Error types from the resolver and runtime.
 */
export type ACRErrorCode =
  | 'DEPENDENCY_MISSING'
  | 'CONFLICT'
  | 'CIRCULAR_DEPENDENCY'
  | 'BUDGET_OVERFLOW'
  | 'TOOL_UNAVAILABLE'
  | 'MOUNT_FAILED'
  | 'PERMISSION_DENIED'
  | 'STATE_LOST'
  | 'TOOL_ERROR'
  | 'VERIFICATION_FAILED';

export interface ACRError {
  code: ACRErrorCode;
  message: string;
  capability?: string;
  details?: Record<string, unknown>;
}

export interface ConflictError {
  code: 'CONFLICT';
  capabilities: [string, string];
  sharedProvides: string[];
}
