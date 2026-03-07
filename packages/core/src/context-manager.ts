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

    // Place in COLD zone at index resolution
    this.capabilities.set(manifest.name, {
      manifest,
      resolution: 'index',
      zone: 'COLD',
      budgetUsed: manifest.budget.index,
      mountedAt: Date.now(),
      lastAccessedAt: Date.now(),
      suppressedTriggers: false,
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
    const mounted: MountedCapability = {
      manifest,
      resolution,
      zone,
      budgetUsed: targetBudget,
      mountedAt: Date.now(),
      lastAccessedAt: Date.now(),
      suppressedTriggers: false,
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
   * Plan LRU demotions to free up the required tokens.
   */
  private planDemotions(tokensNeeded: number, exclude: string): Demotion[] {
    const demotions: Demotion[] = [];
    let freed = 0;

    // Sort by last accessed (LRU first), then by budget (smallest savings first)
    const candidates = Array.from(this.capabilities.values())
      .filter(c => c.manifest.name !== exclude && c.resolution !== 'index')
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    for (const candidate of candidates) {
      if (freed >= tokensNeeded) break;

      // Demote one level at a time
      const levels: ResolutionLevel[] = ['deep', 'standard', 'summary', 'index'];
      const currentIdx = levels.indexOf(candidate.resolution);

      for (let i = currentIdx + 1; i < levels.length && freed < tokensNeeded; i++) {
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
          break; // one demotion per capability per round
        }
      }
    }

    return demotions;
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
