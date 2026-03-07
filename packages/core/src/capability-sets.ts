/**
 * ACR Capability Sets & Roles — composition layer.
 *
 * Capability Sets: named bundles of capabilities at specific resolutions.
 * Roles: top-level compositions that include sets, individual capabilities, and policies.
 */

import type { CapabilityManifest, ResolutionLevel } from '@acr/schema';

export interface CapabilitySetMember {
  name: string;
  resolution: ResolutionLevel;
}

export interface CapabilitySetDefinition {
  name: string;
  type: 'capability-set';
  version: string;
  description: string;
  members: CapabilitySetMember[];
  /** Maximum total budget for all members */
  childrenTotal?: number;
  /** What to do when children exceed budget */
  overflowPolicy?: 'demote_lowest_priority' | 'error' | 'request_human';
}

export interface RoleDefinition {
  name: string;
  type: 'role';
  version: string;
  description: string;
  /** Capability sets included in this role */
  sets: string[];
  /** Individual capabilities (overrides set resolution) */
  capabilities: CapabilitySetMember[];
  /** Identity context (agent personality, not capability instructions) */
  identity?: string;
  /** Session policy name to apply */
  sessionPolicy?: string;
}

/**
 * Resolve a capability set to a flat list of capabilities with resolutions.
 * Handles nested sets and deduplication.
 */
export function resolveCapabilitySet(
  setDef: CapabilitySetDefinition,
  manifests: Map<string, CapabilityManifest>,
): { capabilities: CapabilitySetMember[]; totalBudget: number; warnings: string[] } {
  const resolved: Map<string, CapabilitySetMember> = new Map();
  const warnings: string[] = [];
  let totalBudget = 0;

  for (const member of setDef.members) {
    const manifest = manifests.get(member.name);
    if (!manifest) {
      warnings.push(`Capability "${member.name}" not found in registry`);
      continue;
    }

    // If already resolved at a higher resolution, keep the higher one
    const existing = resolved.get(member.name);
    if (existing) {
      const levels: ResolutionLevel[] = ['index', 'summary', 'standard', 'deep'];
      if (levels.indexOf(member.resolution) > levels.indexOf(existing.resolution)) {
        // New is higher resolution — replace
        totalBudget -= getBudget(manifests.get(existing.name)!, existing.resolution);
        resolved.set(member.name, member);
        totalBudget += getBudget(manifest, member.resolution);
      }
    } else {
      resolved.set(member.name, member);
      totalBudget += getBudget(manifest, member.resolution);
    }
  }

  // Check children_total budget constraint
  if (setDef.childrenTotal && totalBudget > setDef.childrenTotal) {
    const policy = setDef.overflowPolicy ?? 'demote_lowest_priority';
    if (policy === 'error') {
      warnings.push(
        `Set "${setDef.name}" exceeds children_total (${totalBudget} > ${setDef.childrenTotal})`
      );
    } else if (policy === 'demote_lowest_priority') {
      // Demote lowest priority members until within budget
      const sorted = [...resolved.values()].sort((a, b) => {
        const aManifest = manifests.get(a.name);
        const bManifest = manifests.get(b.name);
        const priorityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        return (priorityOrder[aManifest?.priority ?? 'medium'] ?? 2) -
               (priorityOrder[bManifest?.priority ?? 'medium'] ?? 2);
      });

      const levels: ResolutionLevel[] = ['deep', 'standard', 'summary', 'index'];
      for (const member of sorted) {
        if (totalBudget <= setDef.childrenTotal) break;
        const manifest = manifests.get(member.name)!;
        const currentIdx = levels.indexOf(member.resolution);
        if (currentIdx < levels.length - 1) {
          const newRes = levels[currentIdx + 1];
          const saved = getBudget(manifest, member.resolution) - getBudget(manifest, newRes);
          member.resolution = newRes;
          totalBudget -= saved;
          warnings.push(`Demoted "${member.name}" to ${newRes} (budget pressure)`);
        }
      }
    }
  }

  return {
    capabilities: [...resolved.values()],
    totalBudget,
    warnings,
  };
}

/**
 * Resolve a role to a flat list of capabilities.
 */
export function resolveRole(
  role: RoleDefinition,
  sets: Map<string, CapabilitySetDefinition>,
  manifests: Map<string, CapabilityManifest>,
): { capabilities: CapabilitySetMember[]; totalBudget: number; warnings: string[] } {
  const resolved: Map<string, CapabilitySetMember> = new Map();
  const allWarnings: string[] = [];
  let totalBudget = 0;

  // Resolve capability sets first
  for (const setName of role.sets) {
    const setDef = sets.get(setName);
    if (!setDef) {
      allWarnings.push(`Capability set "${setName}" not found`);
      continue;
    }

    const setResult = resolveCapabilitySet(setDef, manifests);
    allWarnings.push(...setResult.warnings);

    for (const cap of setResult.capabilities) {
      if (!resolved.has(cap.name)) {
        resolved.set(cap.name, cap);
      }
    }
  }

  // Individual capabilities override set resolutions
  for (const cap of role.capabilities) {
    resolved.set(cap.name, cap);
  }

  // Recalculate total budget
  for (const [name, member] of resolved) {
    const manifest = manifests.get(name);
    if (manifest) {
      totalBudget += getBudget(manifest, member.resolution);
    }
  }

  return {
    capabilities: [...resolved.values()],
    totalBudget,
    warnings: allWarnings,
  };
}

function getBudget(manifest: CapabilityManifest, resolution: ResolutionLevel): number {
  switch (resolution) {
    case 'deep': return manifest.budget.deep ?? manifest.budget.standard;
    case 'standard': return manifest.budget.standard;
    case 'summary': return manifest.budget.summary;
    case 'index': return manifest.budget.index;
  }
}
