import type {
  CapabilityManifest,
  ResolutionLevel,
  ContextManagerConfig,
  ContextSnapshot,
  MountedCapability,
  MountResult,
  MountError,
  UnmountResult,
  Demotion,
  RegistryEntry,
  CapabilityStatus,
  ContextZone,
  TriggerMatch,
  RuntimeState,
  ACREvent,
  ACREventHandler,
  SerializedState,
  EscalationRequest,
  EscalationResult,
  ProxyDecision,
} from '@acr/schema';

import { TriggerEngine } from './trigger-engine.js';
import { CapabilityProxy } from './capability-proxy.js';
import { InMemoryStateStore, serializeState, formatStateForContext } from './state-store.js';

/**
 * Context Manager — the top-level runtime orchestrator for ACR.
 *
 * Manages dynamic mounting/unmounting, trigger evaluation, budget enforcement,
 * state persistence, and permission proxying for agent capabilities.
 *
 * Implements the full lifecycle described in ACR spec Section 7.
 */
export class ContextManager {
  private readonly config: ContextManagerConfig;
  private readonly capabilities: Map<string, MountedCapability> = new Map();
  private readonly manifests: Map<string, CapabilityManifest> = new Map();
  private readonly triggerEngine: TriggerEngine;
  private readonly proxy: CapabilityProxy;
  private readonly stateStore: InMemoryStateStore;
  private readonly eventHandlers: ACREventHandler[] = [];
  private readonly suppressedCapabilities: Set<string> = new Set();

  constructor(config: ContextManagerConfig) {
    this.config = config;
    this.triggerEngine = new TriggerEngine();
    this.proxy = new CapabilityProxy(config.defaultPermissionPolicy);
    this.stateStore = config.stateStore as InMemoryStateStore ?? new InMemoryStateStore();

    // Forward proxy events
    this.proxy.on(event => this.emit(event));
  }

  // ─── Registration ────────────────────────────────────────────────

  /**
   * Register a capability manifest. Does NOT mount it.
   * Places it in the COLD zone at index resolution.
   */
  registerCapability(manifest: CapabilityManifest): void {
    this.manifests.set(manifest.name, manifest);

    const isPinned = this.config.pinnedCapabilities?.includes(manifest.name) ?? false;
    const priority = manifest.priority ?? this.config.defaultPriority ?? 'medium';

    // Place in COLD zone at index resolution (or RESIDENT if pinned)
    this.capabilities.set(manifest.name, {
      manifest,
      resolution: 'index',
      zone: isPinned ? 'RESIDENT' : 'COLD',
      budgetUsed: manifest.budget.index,
      mountedAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
      suppressedTriggers: false,
      pinned: isPinned,
      priority,
    });

    // Register triggers
    this.triggerEngine.register(manifest);
  }

  /**
   * Register multiple capabilities at once.
   */
  registerAll(manifests: CapabilityManifest[]): void {
    for (const m of manifests) {
      this.registerCapability(m);
    }
  }

  // ─── Mount / Unmount ─────────────────────────────────────────────

  /**
   * Mount a capability at the requested resolution.
   * Handles budget fitting, LRU demotion, state restoration, and co-activation.
   */
  async mount(
    name: string,
    resolution: ResolutionLevel = 'standard',
  ): Promise<MountResult | MountError> {
    const manifest = this.manifests.get(name);
    if (!manifest) {
      return {
        success: false,
        code: 'MOUNT_FAILED',
        capability: name,
        message: `Capability "${name}" not found in registry`,
        budgetNeeded: 0,
        budgetAvailable: this.availableBudget(),
        suggestedDemotions: [],
      };
    }

    const targetBudget = this.getBudgetForResolution(manifest, resolution);
    const currentEntry = this.capabilities.get(name);
    const currentBudget = currentEntry?.budgetUsed ?? 0;
    const additionalNeeded = targetBudget - currentBudget;

    // Check if we have enough budget
    const available = this.availableBudget();
    let demotions: Demotion[] = [];

    if (additionalNeeded > available) {
      // Try LRU demotion
      demotions = this.planDemotions(additionalNeeded - available, name);
      const totalFreed = demotions.reduce((sum, d) => sum + d.tokensSaved, 0);

      if (totalFreed < additionalNeeded - available) {
        return {
          success: false,
          code: 'MOUNT_FAILED',
          capability: name,
          message: `Insufficient budget. Need ${additionalNeeded} tokens, only ${available + totalFreed} available after demotions.`,
          budgetNeeded: additionalNeeded,
          budgetAvailable: available + totalFreed,
          suggestedDemotions: demotions,
        };
      }

      // Execute demotions
      for (const d of demotions) {
        await this.demoteCapability(d.capability, d.to);
      }
    }

    // Restore state if available
    let restoredState = false;
    let state: SerializedState | null = null;

    if (manifest.state_schema) {
      state = await this.stateStore.load(
        this.config.sessionId,
        name,
        manifest.version,
      );
      if (state) {
        restoredState = true;
        this.emit({
          type: 'state:restored',
          timestamp: Date.now(),
          capability: name,
          details: { schemaVersion: state.schemaVersion, fieldCount: Object.keys(state.fields).length },
        });
      }
    }

    // Mount
    const zone = this.zoneForResolution(resolution);
    const existingEntry = this.capabilities.get(name);
    const mounted: MountedCapability = {
      manifest,
      resolution,
      zone,
      budgetUsed: targetBudget,
      mountedAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: (existingEntry?.accessCount ?? 0) + 1,
      suppressedTriggers: false,
      pinned: existingEntry?.pinned ?? false,
      priority: manifest.priority ?? this.config.defaultPriority ?? 'medium',
      state: state ?? undefined,
    };

    this.capabilities.set(name, mounted);
    this.suppressedCapabilities.delete(name);

    this.emit({
      type: 'capability:mounted',
      timestamp: Date.now(),
      capability: name,
      details: { resolution, zone, budgetUsed: targetBudget, restoredState },
    });

    // Handle dependency enforcement — mount required capabilities
    if (manifest.requires?.capabilities) {
      for (const dep of manifest.requires.capabilities) {
        if (!this.isHotOrWarm(dep.name)) {
          const depResolution = dep.resolution ?? 'summary';
          const depResult = await this.mount(dep.name, depResolution);
          if (!depResult.success) {
            this.emit({
              type: 'budget:warning',
              timestamp: Date.now(),
              capability: name,
              details: {
                reason: `Dependency "${dep.name}" failed to mount`,
                dependency: dep.name,
              },
            });
          }
        }
      }
    }

    // Handle co-activation
    if (manifest.activation?.co_activates) {
      for (const coName of manifest.activation.co_activates) {
        if (!this.isHotOrWarm(coName)) {
          await this.mount(coName, 'summary');
        }
      }
    }

    return {
      success: true,
      capability: name,
      resolution,
      zone,
      budgetUsed: targetBudget,
      demotions,
      restoredState,
    };
  }

  /**
   * Unmount a capability — demote to index, serialize state, suppress triggers.
   */
  async unmount(name: string): Promise<UnmountResult> {
    const entry = this.capabilities.get(name);
    if (!entry) {
      return {
        capability: name,
        previousResolution: 'index',
        stateSerialized: false,
        triggersSuppressed: false,
      };
    }

    const previousResolution = entry.resolution;
    let stateSerialized = false;

    // Serialize state if schema defined
    if (entry.manifest.state_schema && entry.state) {
      await this.stateStore.save(this.config.sessionId, entry.state);
      stateSerialized = true;
      this.emit({
        type: 'state:saved',
        timestamp: Date.now(),
        capability: name,
        details: { schemaVersion: entry.state.schemaVersion },
      });
    }

    // Demote to COLD/index
    entry.resolution = 'index';
    entry.zone = 'COLD';
    entry.budgetUsed = entry.manifest.budget.index;
    entry.suppressedTriggers = true;
    entry.state = undefined;

    this.suppressedCapabilities.add(name);

    this.emit({
      type: 'capability:unmounted',
      timestamp: Date.now(),
      capability: name,
      details: { previousResolution },
    });

    return {
      capability: name,
      previousResolution,
      stateSerialized,
      triggersSuppressed: true,
    };
  }

  // ─── Trigger Processing ──────────────────────────────────────────

  /**
   * Process a user message — evaluate triggers and auto-mount matches.
   * Returns list of newly mounted capabilities.
   */
  async processMessage(message: string): Promise<TriggerMatch[]> {
    // Skip HOT capabilities and suppressed ones
    const skip = new Set<string>();
    for (const [name, entry] of this.capabilities) {
      if (entry.zone === 'HOT' || entry.suppressedTriggers) {
        skip.add(name);
      }
    }

    const matches = this.triggerEngine.evaluatePatterns(message, skip);

    for (const match of matches) {
      if (this.suppressedCapabilities.has(match.capabilityName)) {
        this.emit({
          type: 'trigger:suppressed',
          timestamp: Date.now(),
          capability: match.capabilityName,
          details: { reason: 'agent-unmounted' },
        });
        continue;
      }

      this.emit({
        type: 'trigger:matched',
        timestamp: Date.now(),
        capability: match.capabilityName,
        details: { type: match.triggerType, matched: match.matchedText },
      });

      await this.mount(match.capabilityName, 'standard');
    }

    return matches;
  }

  /**
   * Process a runtime state change — evaluate runtime event triggers.
   */
  async processStateChange(state: RuntimeState): Promise<TriggerMatch[]> {
    const skip = new Set<string>();
    for (const [name, entry] of this.capabilities) {
      if (entry.zone === 'HOT' || entry.suppressedTriggers) {
        skip.add(name);
      }
    }

    const matches = this.triggerEngine.evaluateRuntimeEvents(state, skip);

    for (const match of matches) {
      if (!this.suppressedCapabilities.has(match.capabilityName)) {
        await this.mount(match.capabilityName, 'standard');
      }
    }

    return matches;
  }

  // ─── Permission Proxy ────────────────────────────────────────────

  /**
   * Check if a tool call is allowed under the active capability.
   */
  checkPermission(tool: string, method: string, activeCapability?: string): ProxyDecision {
    const manifest = activeCapability
      ? this.manifests.get(activeCapability) ?? null
      : this.getActiveCapability();
    return this.proxy.check(manifest, tool, method);
  }

  /**
   * Create an escalation request for a denied action.
   */
  escalate(tool: string, method: string, reason: string, capability?: string): EscalationRequest {
    const capName = capability ?? this.getActiveCapability()?.name ?? 'unknown';
    return this.proxy.createEscalation(capName, tool, method, reason);
  }

  /**
   * Record a human escalation decision.
   */
  resolveEscalation(result: EscalationResult): void {
    this.proxy.recordApproval(result);
  }

  // ─── State Management ────────────────────────────────────────────

  /**
   * Update state for a mounted capability.
   */
  updateState(capabilityName: string, fields: Record<string, unknown>): void {
    const entry = this.capabilities.get(capabilityName);
    if (!entry || !entry.manifest.state_schema) return;

    const state = serializeState(
      capabilityName,
      entry.manifest.version,
      entry.manifest.state_schema,
      fields,
    );

    entry.state = state;
  }

  // ─── Queries ─────────────────────────────────────────────────────

  /**
   * Get the capability registry (all capabilities at index level).
   */
  registry(): RegistryEntry[] {
    const entries: RegistryEntry[] = [];
    for (const [, entry] of this.capabilities) {
      entries.push({
        name: entry.manifest.name,
        version: entry.manifest.version,
        type: entry.manifest.type,
        description: entry.manifest.description,
        provides: entry.manifest.provides,
        zone: entry.zone,
        resolution: entry.resolution,
        budgetUsed: entry.budgetUsed,
      });
    }
    return entries;
  }

  /**
   * Get mounted (non-index) capabilities.
   */
  mounted(): MountedCapability[] {
    return Array.from(this.capabilities.values())
      .filter(c => c.resolution !== 'index');
  }

  /**
   * Get status of a specific capability.
   */
  status(name: string): CapabilityStatus | null {
    const entry = this.capabilities.get(name);
    if (!entry) return null;

    return {
      name: entry.manifest.name,
      zone: entry.zone,
      resolution: entry.resolution,
      budgetUsed: entry.budgetUsed,
      hasState: !!entry.state,
      stateVersion: entry.state?.schemaVersion,
      permissions: entry.manifest.permissions?.tools ?? {},
      triggersActive: !entry.suppressedTriggers && !!entry.manifest.activation?.triggers?.length,
      triggersSuppressed: entry.suppressedTriggers,
    };
  }

  /**
   * Get a snapshot of the full context state.
   */
  snapshot(): ContextSnapshot {
    const caps = Array.from(this.capabilities.values());
    const budgetUsed = caps.reduce((sum, c) => sum + c.budgetUsed, 0);

    return {
      sessionId: this.config.sessionId,
      windowSize: this.config.windowSize,
      residentBudget: this.config.residentBudget,
      budgetUsed,
      budgetAvailable: this.config.windowSize - this.config.residentBudget - budgetUsed,
      utilization: budgetUsed / (this.config.windowSize - this.config.residentBudget),
      capabilities: this.registry(),
      hotCount: caps.filter(c => c.zone === 'HOT').length,
      warmCount: caps.filter(c => c.zone === 'WARM').length,
      coldCount: caps.filter(c => c.zone === 'COLD').length,
    };
  }

  /**
   * Generate a context prompt with all mounted capabilities at their resolution levels.
   * NOTE: For file-based context with LOD content, use LODLoader.generateContext() via AgentAPI.
   * This method uses behavioral.core only (no disk I/O).
   */
  generateContext(): string {
    const sections: string[] = [];
    const sorted = Array.from(this.capabilities.values())
      .filter(c => c.resolution !== 'index')
      .sort((a, b) => {
        const zoneOrder = { RESIDENT: 0, HOT: 1, WARM: 2, COLD: 3 };
        return zoneOrder[a.zone] - zoneOrder[b.zone];
      });

    // Registry (always included)
    sections.push('## Available Capabilities');
    for (const [, entry] of this.capabilities) {
      sections.push(`- ${entry.manifest.name}: ${entry.manifest.description}`);
    }
    sections.push('');

    // Mounted capabilities
    for (const entry of sorted) {
      sections.push(`## [${entry.zone}] ${entry.manifest.name} (${entry.resolution})`);

      if (entry.state) {
        sections.push(formatStateForContext(entry.state));
        sections.push('');
      }

      if (entry.manifest.behavioral?.core) {
        sections.push(entry.manifest.behavioral.core);
      }

      sections.push('');
    }

    return sections.join('\n');
  }

  // ─── Events ──────────────────────────────────────────────────────

  /**
   * Subscribe to context manager events.
   */
  on(handler: ACREventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Clean up session state.
   */
  async cleanup(): Promise<void> {
    await this.stateStore.deleteSession(this.config.sessionId);
    this.capabilities.clear();
    this.manifests.clear();
    this.suppressedCapabilities.clear();
  }

  // ─── Internal ────────────────────────────────────────────────────

  private availableBudget(): number {
    const used = Array.from(this.capabilities.values())
      .reduce((sum, c) => sum + c.budgetUsed, 0);
    return this.config.windowSize - this.config.residentBudget - used;
  }

  private getBudgetForResolution(manifest: CapabilityManifest, resolution: ResolutionLevel): number {
    switch (resolution) {
      case 'index': return manifest.budget.index;
      case 'summary': return manifest.budget.summary;
      case 'standard': return manifest.budget.standard;
      case 'deep': return manifest.budget.deep ?? manifest.budget.standard;
    }
  }

  private zoneForResolution(resolution: ResolutionLevel): ContextZone {
    switch (resolution) {
      case 'deep':
      case 'standard': return 'HOT';
      case 'summary': return 'WARM';
      case 'index': return 'COLD';
    }
  }

  private isHotOrWarm(name: string): boolean {
    const entry = this.capabilities.get(name);
    return entry?.zone === 'HOT' || entry?.zone === 'WARM';
  }

  private getActiveCapability(): CapabilityManifest | null {
    // Return the most recently accessed HOT capability
    let latest: MountedCapability | null = null;
    for (const entry of this.capabilities.values()) {
      if (entry.zone === 'HOT') {
        if (!latest || entry.lastAccessedAt > latest.lastAccessedAt) {
          latest = entry;
        }
      }
    }
    return latest?.manifest ?? null;
  }

  /**
   * Plan priority-weighted demotions to free up the required tokens.
   *
   * Eviction score (lower = evict first):
   *   score = priorityWeight * 40
   *        + recencyScore * 25
   *        + frequencyScore * 15
   *        + remountCostScore * 10
   *        + dependencyScore * 10
   *
   * Pinned capabilities are never evicted.
   * Dependency floors are respected (if A requires B, B can't go below A's required resolution).
   */
  private planDemotions(tokensNeeded: number, exclude: string): Demotion[] {
    const demotions: Demotion[] = [];
    let freed = 0;

    const now = Date.now();
    const PRIORITY_WEIGHTS: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    // Calculate eviction scores for all demotable candidates
    const candidates = Array.from(this.capabilities.values())
      .filter(c =>
        c.manifest.name !== exclude &&
        c.resolution !== 'index' &&
        !c.pinned  // Never evict pinned/RESIDENT capabilities
      )
      .map(c => {
        const priorityWeight = PRIORITY_WEIGHTS[c.priority] ?? 2;
        const age = now - c.lastAccessedAt;
        const maxAge = 600000; // 10 minutes
        const recencyScore = Math.min(age / maxAge, 1); // 0 = just accessed, 1 = old
        const frequencyScore = Math.min(c.accessCount / 10, 1); // 0 = rarely used, 1 = heavily used
        const remountCost = c.manifest.budget.standard / 5000; // normalize: bigger = more costly to remount
        const hasDependents = this.hasDependents(c.manifest.name);

        // Lower score = evict first
        const evictionScore =
          priorityWeight * 40 +
          (1 - recencyScore) * 25 + // invert: recently accessed = higher score = keep
          frequencyScore * 15 +
          remountCost * 10 +
          (hasDependents ? 10 : 0);

        return { capability: c, score: evictionScore };
      })
      .sort((a, b) => a.score - b.score); // lowest score first = evict first

    for (const { capability: candidate } of candidates) {
      if (freed >= tokensNeeded) break;

      // Check dependency floors
      const minResolution = this.getDependencyFloor(candidate.manifest.name);

      const levels: ResolutionLevel[] = ['deep', 'standard', 'summary', 'index'];
      const currentIdx = levels.indexOf(candidate.resolution);
      const floorIdx = minResolution ? levels.indexOf(minResolution) : levels.length - 1;

      for (let i = currentIdx + 1; i <= floorIdx && freed < tokensNeeded; i++) {
        const targetLevel = levels[i];
        const targetBudget = this.getBudgetForResolution(candidate.manifest, targetLevel);
        const savings = candidate.budgetUsed - targetBudget;

        if (savings > 0) {
          demotions.push({
            capability: candidate.manifest.name,
            from: candidate.resolution,
            to: targetLevel,
            tokensSaved: savings,
          });
          freed += savings;
          break;
        }
      }
    }

    return demotions;
  }

  /**
   * Check if any mounted capability depends on the given capability.
   */
  private hasDependents(capabilityName: string): boolean {
    for (const [, entry] of this.capabilities) {
      if (entry.resolution === 'index') continue;
      const deps = entry.manifest.requires?.capabilities;
      if (deps?.some(d => d.name === capabilityName)) return true;
    }
    return false;
  }

  /**
   * Get the minimum resolution a capability can be demoted to
   * based on what other mounted capabilities require from it.
   */
  private getDependencyFloor(capabilityName: string): ResolutionLevel | null {
    let floor: ResolutionLevel | null = null;
    const levelOrder: Record<string, number> = { index: 0, summary: 1, standard: 2, deep: 3 };

    for (const [, entry] of this.capabilities) {
      if (entry.resolution === 'index') continue;
      const deps = entry.manifest.requires?.capabilities;
      if (!deps) continue;

      for (const dep of deps) {
        if (dep.name === capabilityName && dep.resolution) {
          if (!floor || levelOrder[dep.resolution] > levelOrder[floor]) {
            floor = dep.resolution;
          }
        }
      }
    }

    return floor;
  }

  /**
   * Execute a demotion — change resolution and zone.
   */
  private async demoteCapability(name: string, to: ResolutionLevel): Promise<void> {
    const entry = this.capabilities.get(name);
    if (!entry) return;

    const from = entry.resolution;

    // Serialize state if evicting from HOT
    if (entry.zone === 'HOT' && entry.manifest.state_schema && entry.state) {
      await this.stateStore.save(this.config.sessionId, entry.state);
      this.emit({
        type: 'state:saved',
        timestamp: Date.now(),
        capability: name,
        details: { reason: 'demotion', from, to },
      });
    }

    entry.resolution = to;
    entry.zone = this.zoneForResolution(to);
    entry.budgetUsed = this.getBudgetForResolution(entry.manifest, to);

    if (to === 'index') {
      entry.state = undefined;
    }

    this.emit({
      type: 'capability:demoted',
      timestamp: Date.now(),
      capability: name,
      details: { from, to, newBudget: entry.budgetUsed },
    });
  }

  private emit(event: ACREvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }
}
