/**
 * Spawn Resolver — capability inheritance for multi-agent scenarios.
 *
 * Implements Kit's model:
 *   - Role: never inherited (child is a different agent)
 *   - Capability sets: explicitly passed by parent
 *   - Session policies: inherited from parent unless overridden
 *   - State: never inherited (clean context is the point)
 *
 * Usage:
 *   const childConfig = resolveSpawnConfig(parentConfig, {
 *     capabilities: ['nestjs', 'prisma-gen', 'github'],
 *     resolutions: { nestjs: 'deep', github: 'summary' },
 *     policyOverrides: { allowed_capabilities: [...] },
 *   });
 */

import type {
  CapabilityManifest,
  ResolutionLevel,
  ContextManagerConfig,
} from '@agentcapabilityruntime/schema';

export interface SpawnPolicyConfig {
  name: string;
  allowed_capabilities?: string[];
  default_resolution?: ResolutionLevel;
  max_capabilities?: number;
}

export interface SpawnCapabilityRequest {
  /** Capabilities to include in the child session */
  capabilities: string[];

  /** Resolution overrides per capability (default: standard) */
  resolutions?: Record<string, ResolutionLevel>;

  /** Policy overrides (merged with parent policy) */
  policyOverrides?: Partial<SpawnPolicyConfig>;

  /** Child session ID */
  sessionId: string;

  /** Maximum token budget for child (default: inherit parent windowSize) */
  maxBudget?: number;
}

export interface SpawnConfig {
  /** Capabilities to register in the child's context manager */
  capabilities: string[];

  /** Resolution for each capability */
  resolutions: Record<string, ResolutionLevel>;

  /** Session policy for the child */
  policy: SpawnPolicyConfig;

  /** Window size for the child */
  windowSize: number;

  /** Session ID */
  sessionId: string;

  /** Model routing preferences inherited from capabilities */
  modelPreferences?: {
    preferred?: string;
    fallback?: string;
    constraints: string[];
    perCapability: Record<string, { preferred?: string; fallback?: string | null; constraint?: string }>;
  };
}

/**
 * Resolve the configuration for a spawned child session.
 *
 * Applies Kit's inheritance model:
 *   - Only explicitly listed capabilities are passed
 *   - Parent policy inherited as baseline, with optional overrides
 *   - No state transfer (clean context)
 *   - No role inheritance
 */
export function resolveSpawnConfig(
  parentWindowSize: number,
  parentPolicy: SpawnPolicyConfig | undefined,
  request: SpawnCapabilityRequest,
): SpawnConfig {
  const defaultResolution: ResolutionLevel = 'standard';

  // Build resolution map
  const resolutions: Record<string, ResolutionLevel> = {};
  for (const cap of request.capabilities) {
    resolutions[cap] = request.resolutions?.[cap] ?? defaultResolution;
  }

  // Inherit parent policy with overrides
  const basePolicy: SpawnPolicyConfig = {
    name: `spawn-${request.sessionId}`,
    allowed_capabilities: request.capabilities,
    ...parentPolicy,
  };

  // Apply overrides
  const policy: SpawnPolicyConfig = {
    ...basePolicy,
    ...request.policyOverrides,
    // Narrow allowed_capabilities to request unless explicitly overridden
    allowed_capabilities: request.policyOverrides?.allowed_capabilities ?? request.capabilities,
  };

  return {
    capabilities: request.capabilities,
    resolutions,
    policy,
    windowSize: request.maxBudget ?? parentWindowSize,
    sessionId: request.sessionId,
  };
}

/**
 * Auto-resolve capabilities from a task description using the TaskResolver,
 * then produce a SpawnConfig. This is the Factory integration path.
 *
 * Usage:
 *   const config = resolveFromTask(
 *     taskResolver,
 *     "Implement NestJS auth with Prisma",
 *     { sessionId: 'worker-42', maxBudget: 50000 }
 *   );
 */
export function resolveFromTask(
  taskResolver: { resolve: (task: string) => {
    capabilities: Array<{ name: string; resolution: ResolutionLevel }>;
    modelPreferences?: {
      preferred?: string;
      fallback?: string;
      constraints: string[];
      perCapability: Record<string, { preferred?: string; fallback?: string | null; constraint?: string }>;
    };
  } },
  taskDescription: string,
  options: {
    sessionId: string;
    parentWindowSize?: number;
    parentPolicy?: SpawnPolicyConfig;
    maxBudget?: number;
    policyOverrides?: Partial<SpawnPolicyConfig>;
  },
): SpawnConfig {
  const resolved = taskResolver.resolve(taskDescription);

  const capabilities = resolved.capabilities.map(c => c.name);
  const resolutions: Record<string, ResolutionLevel> = {};
  for (const cap of resolved.capabilities) {
    resolutions[cap.name] = cap.resolution;
  }

  const config = resolveSpawnConfig(
    options.parentWindowSize ?? 128000,
    options.parentPolicy,
    {
      capabilities,
      resolutions,
      sessionId: options.sessionId,
      maxBudget: options.maxBudget,
      policyOverrides: options.policyOverrides,
    },
  );

  // Pass through model preferences from task resolution
  if (resolved.modelPreferences) {
    config.modelPreferences = resolved.modelPreferences;
  }

  return config;
}
