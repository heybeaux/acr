import type {
  CapabilityManifest,
  ResolutionLevel,
  DefaultPermissionPolicy,
  PermissionValue,
} from '@agentcapabilityruntime/schema';

/**
 * Session Policy — constrains capabilities and permissions per session type.
 *
 * Session policies act as an overlay on top of capability manifests:
 * - Resolve conflicts by picking preferred implementations
 * - Deny specific capabilities entirely
 * - Override permission policies
 * - Set resolution constraints
 *
 * Applied by the Resolver at composition time, enforced by the Proxy at runtime.
 */

export interface SessionPolicy {
  name: string;
  description: string;

  /** Maps provides-tag → preferred capability name. null = deny all implementations. */
  resolution: Record<string, string | null>;

  /** Override specific tool permissions. */
  permissions_override: Record<string, Record<string, PermissionValue>>;

  /** Override the default permission policy for this session. */
  default_permission_policy?: DefaultPermissionPolicy;

  /** Constrain maximum resolution level for capabilities. */
  max_resolution?: Record<string, ResolutionLevel>;

  /** Capabilities explicitly allowed (whitelist mode). If set, unlisted caps are denied. */
  allowed_capabilities?: string[];

  /** Capabilities explicitly denied (blacklist mode). */
  denied_capabilities?: string[];
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  preferredImplementation?: string;
  maxResolution?: ResolutionLevel;
  permissionOverrides: Record<string, Record<string, PermissionValue>>;
  defaultPolicy?: DefaultPermissionPolicy;
}

/**
 * Evaluate a session policy against a set of manifests.
 * Returns filtered and constrained manifests.
 */
export function applySessionPolicy(
  manifests: CapabilityManifest[],
  policy: SessionPolicy,
): {
  allowed: CapabilityManifest[];
  denied: Array<{ name: string; reason: string }>;
  warnings: string[];
} {
  const allowed: CapabilityManifest[] = [];
  const denied: Array<{ name: string; reason: string }> = [];
  const warnings: string[] = [];

  for (const manifest of manifests) {
    // Check explicit deny list
    if (policy.denied_capabilities?.includes(manifest.name)) {
      denied.push({ name: manifest.name, reason: `Explicitly denied by policy "${policy.name}"` });
      continue;
    }

    // Check whitelist mode
    if (policy.allowed_capabilities && !policy.allowed_capabilities.includes(manifest.name)) {
      denied.push({ name: manifest.name, reason: `Not in allowed list of policy "${policy.name}"` });
      continue;
    }

    // Check resolution conflicts
    let conflictDenied = false;
    for (const providesTag of manifest.provides) {
      const preferred = policy.resolution[providesTag];

      if (preferred === null) {
        // Entire provides-tag category is denied
        denied.push({
          name: manifest.name,
          reason: `Provides "${providesTag}" which is denied by policy "${policy.name}"`,
        });
        conflictDenied = true;
        break;
      }

      if (preferred !== undefined && preferred !== manifest.name) {
        // Different implementation preferred
        denied.push({
          name: manifest.name,
          reason: `Policy "${policy.name}" prefers "${preferred}" for "${providesTag}"`,
        });
        conflictDenied = true;
        break;
      }
    }

    if (conflictDenied) continue;

    allowed.push(manifest);
  }

  return { allowed, denied, warnings };
}

/**
 * Check if a specific capability is allowed under a policy.
 */
export function checkCapabilityPolicy(
  manifest: CapabilityManifest,
  policy: SessionPolicy,
): PolicyResult {
  // Denied?
  if (policy.denied_capabilities?.includes(manifest.name)) {
    return {
      allowed: false,
      reason: `Denied by policy "${policy.name}"`,
      permissionOverrides: {},
    };
  }

  // Whitelist mode?
  if (policy.allowed_capabilities && !policy.allowed_capabilities.includes(manifest.name)) {
    return {
      allowed: false,
      reason: `Not in allowed list of policy "${policy.name}"`,
      permissionOverrides: {},
    };
  }

  // Resolution preference?
  let preferredImplementation: string | undefined;
  for (const tag of manifest.provides) {
    const preferred = policy.resolution[tag];
    if (preferred === null) {
      return {
        allowed: false,
        reason: `Provides "${tag}" which is denied by policy "${policy.name}"`,
        permissionOverrides: {},
      };
    }
    if (preferred !== undefined && preferred !== manifest.name) {
      return {
        allowed: false,
        reason: `Policy prefers "${preferred}" for "${tag}"`,
        permissionOverrides: {},
        preferredImplementation: preferred,
      };
    }
    if (preferred === manifest.name) {
      preferredImplementation = manifest.name;
    }
  }

  return {
    allowed: true,
    preferredImplementation,
    maxResolution: policy.max_resolution?.[manifest.name],
    permissionOverrides: policy.permissions_override,
    defaultPolicy: policy.default_permission_policy,
  };
}

/**
 * Get effective permission for a tool method under a policy.
 * Policy overrides take precedence over manifest permissions.
 */
export function getEffectivePermission(
  manifest: CapabilityManifest,
  policy: SessionPolicy | null,
  tool: string,
  method: string,
): PermissionValue | undefined {
  // Policy override takes precedence
  if (policy?.permissions_override?.[tool]?.[method]) {
    return policy.permissions_override[tool][method];
  }

  // Fall back to manifest permission
  return manifest.permissions?.tools?.[tool]?.[method];
}
