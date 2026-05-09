import type {
  CapabilityManifest,
  ResolvedCapability,
  ResolutionPlan,
  ResolutionLevel,
  ConflictError,
  ACRError,
} from '@agentcapabilityruntime/schema';

export interface ResolverOptions {
  windowSize?: number;  // default: 128000
}

/**
 * Resolve a set of capability manifests into a load plan.
 * Performs: dependency resolution, conflict detection, topological sort, budget fitting.
 */
export function resolve(
  manifests: CapabilityManifest[],
  options: ResolverOptions = {},
): ResolutionPlan {
  const windowSize = options.windowSize ?? 128000;
  const byName = new Map<string, CapabilityManifest>();
  const conflicts: ConflictError[] = [];
  const warnings: string[] = [];

  // Index manifests by name
  for (const m of manifests) {
    if (byName.has(m.name)) {
      warnings.push(`Duplicate capability name: ${m.name}`);
    }
    byName.set(m.name, m);
  }

  // 1. Detect conflicts (shared provides tags)
  const providerMap = new Map<string, string[]>();
  for (const m of manifests) {
    for (const tag of m.provides) {
      const providers = providerMap.get(tag) ?? [];
      providers.push(m.name);
      providerMap.set(tag, providers);
    }
  }
  for (const [tag, providers] of providerMap) {
    if (providers.length > 1) {
      // Also check explicit conflicts declarations
      for (let i = 0; i < providers.length; i++) {
        for (let j = i + 1; j < providers.length; j++) {
          const a = byName.get(providers[i])!;
          const b = byName.get(providers[j])!;
          const aConflicts = a.activation?.conflicts ?? [];
          const bConflicts = b.activation?.conflicts ?? [];
          if (aConflicts.includes(b.name) || bConflicts.includes(a.name)) {
            conflicts.push({
              code: 'CONFLICT',
              capabilities: [a.name, b.name],
              sharedProvides: [tag],
            });
          }
        }
      }
    }
  }

  // 2. Build dependency graph and resolve transitive deps
  const visited = new Set<string>();
  const visiting = new Set<string>();  // for cycle detection
  const sorted: string[] = [];
  const errors: ACRError[] = [];

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      errors.push({
        code: 'CIRCULAR_DEPENDENCY',
        message: `Circular dependency detected involving: ${name}`,
        capability: name,
      });
      return;
    }

    const manifest = byName.get(name);
    if (!manifest) {
      // Check if it's an optional dependency (handled by caller)
      return;
    }

    visiting.add(name);

    // Visit required capabilities
    for (const dep of manifest.requires?.capabilities ?? []) {
      if (!byName.has(dep.name)) {
        if (!dep.optional) {
          errors.push({
            code: 'DEPENDENCY_MISSING',
            message: `Required capability "${dep.name}" not found (required by ${name})`,
            capability: name,
            details: { missing: dep.name },
          });
        } else {
          warnings.push(`Optional dependency "${dep.name}" not available for ${name}`);
        }
        continue;
      }
      visit(dep.name);
    }

    // Visit co-activates
    for (const coName of manifest.activation?.co_activates ?? []) {
      if (byName.has(coName)) {
        visit(coName);
      } else {
        warnings.push(`Co-activate "${coName}" not available for ${name}`);
      }
    }

    visiting.delete(name);
    visited.add(name);
    sorted.push(name);
  }

  // Visit all manifests
  for (const m of manifests) {
    visit(m.name);
  }

  if (errors.length > 0) {
    return {
      capabilities: [],
      totalBudget: 0,
      windowSize,
      utilization: 0,
      conflicts,
      warnings: [...warnings, ...errors.map(e => `ERROR: ${e.message}`)],
    };
  }

  // 3. Assign default resolution levels
  const resolutionMap = new Map<string, ResolutionLevel>();
  for (const m of manifests) {
    resolutionMap.set(m.name, 'standard');
    // Dependency resolution levels
    for (const dep of m.requires?.capabilities ?? []) {
      if (dep.resolution && byName.has(dep.name)) {
        const current = resolutionMap.get(dep.name);
        if (!current || resolutionOrder(dep.resolution) > resolutionOrder(current)) {
          resolutionMap.set(dep.name, dep.resolution);
        }
      }
    }
  }

  // 4. Budget fitting
  let totalBudget = 0;
  const resolved: ResolvedCapability[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const name = sorted[i];
    const manifest = byName.get(name)!;
    const resolution = resolutionMap.get(name) ?? 'standard';
    const budgetUsed = getBudgetForResolution(manifest, resolution);

    resolved.push({
      manifest,
      resolution,
      loadOrder: i,
      transitiveDependencies: getTransitiveDeps(name, byName),
      budgetUsed,
    });
    totalBudget += budgetUsed;
  }

  // Check if over budget
  if (totalBudget > windowSize) {
    warnings.push(
      `Total budget (${totalBudget}) exceeds window size (${windowSize}). ` +
      `Consider demoting low-priority capabilities to summary.`
    );
  }

  return {
    capabilities: resolved,
    totalBudget,
    windowSize,
    utilization: totalBudget / windowSize,
    conflicts,
    warnings,
  };
}

function resolutionOrder(level: ResolutionLevel): number {
  const order: Record<ResolutionLevel, number> = {
    index: 0,
    summary: 1,
    standard: 2,
    deep: 3,
  };
  return order[level];
}

function getBudgetForResolution(
  manifest: CapabilityManifest,
  resolution: ResolutionLevel,
): number {
  switch (resolution) {
    case 'index': return manifest.budget.index;
    case 'summary': return manifest.budget.summary;
    case 'standard': return manifest.budget.standard;
    case 'deep': return manifest.budget.deep ?? manifest.budget.standard;
  }
}

function getTransitiveDeps(
  name: string,
  byName: Map<string, CapabilityManifest>,
  seen = new Set<string>(),
): string[] {
  const manifest = byName.get(name);
  if (!manifest) return [];

  const deps: string[] = [];
  for (const dep of manifest.requires?.capabilities ?? []) {
    if (!seen.has(dep.name) && byName.has(dep.name)) {
      seen.add(dep.name);
      deps.push(dep.name);
      deps.push(...getTransitiveDeps(dep.name, byName, seen));
    }
  }
  return deps;
}
