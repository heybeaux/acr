import type {
  ResolutionLevel,
  RegistryEntry,
  MountedCapability,
  MountResult,
  MountError,
  UnmountResult,
  CapabilityStatus,
  ContextSnapshot,
  EscalationRequest,
  EscalationResult,
  TriggerMatch,
  RuntimeState,
  ACREventHandler,
  CapabilityManifest,
} from '@acr/schema';

import { ContextManager } from './context-manager.js';
import { LODLoader } from './loader.js';
import { SessionPolicy, applySessionPolicy } from './session-policy.js';

/**
 * Agent-Facing API — the clean interface agents interact with.
 *
 * Implements ACR spec Section 9:
 *   capabilities.registry()
 *   capabilities.mounted()
 *   capabilities.mount(name, resolution?)
 *   capabilities.unmount(name)
 *   capabilities.status(name)
 *   capabilities.escalate(tool, method, reason)
 *
 * Plus lifecycle methods for framework integration.
 */

export interface AgentAPIConfig {
  /** Context window size in tokens */
  windowSize?: number;

  /** Tokens reserved for agent identity, personality, objectives */
  residentBudget?: number;

  /** Default permission policy */
  defaultPermissionPolicy?: 'allow-with-log' | 'deny';

  /** Session identifier */
  sessionId?: string;

  /** Capability directories to register */
  capabilityDirs?: string[];

  /** Session policy to apply */
  sessionPolicy?: SessionPolicy;
}

export class AgentAPI {
  private readonly ctx: ContextManager;
  private readonly loader: LODLoader;
  private readonly policy: SessionPolicy | null;
  private initialized = false;

  constructor(config: AgentAPIConfig = {}) {
    this.ctx = new ContextManager({
      windowSize: config.windowSize ?? 128000,
      residentBudget: config.residentBudget ?? 2000,
      defaultPermissionPolicy: config.defaultPermissionPolicy ?? 'allow-with-log',
      sessionId: config.sessionId ?? `session_${Date.now().toString(36)}`,
    });

    this.loader = new LODLoader();
    this.policy = config.sessionPolicy ?? null;

    // Register capability directories if provided
    if (config.capabilityDirs) {
      this.registerDirs(config.capabilityDirs);
    }
  }

  // ─── Lifecycle ───────────────────────────────────────────────────

  /**
   * Register capability directories and apply session policy.
   */
  registerDirs(dirs: string[]): void {
    const manifests = this.loader.registerAll(dirs);

    let allowed: CapabilityManifest[];
    if (this.policy) {
      const result = applySessionPolicy(manifests, this.policy);
      allowed = result.allowed;
      // Log denied capabilities
      for (const d of result.denied) {
        console.warn(`[ACR] Capability denied: ${d.name} — ${d.reason}`);
      }
    } else {
      allowed = manifests;
    }

    this.ctx.registerAll(allowed);
    this.initialized = true;
  }

  /**
   * Process a user message — evaluate triggers, auto-mount, return context.
   */
  async processMessage(message: string): Promise<{
    triggers: TriggerMatch[];
    context: string;
    snapshot: ContextSnapshot;
  }> {
    const triggers = await this.ctx.processMessage(message);

    // Build resolution map from current state
    const resolutions = new Map<string, ResolutionLevel>();
    for (const entry of this.ctx.registry()) {
      resolutions.set(entry.name, entry.resolution);
    }

    const context = this.loader.generateContext(resolutions);
    const snapshot = this.ctx.snapshot();

    return { triggers, context, snapshot };
  }

  /**
   * Process a runtime state change (tool availability, session type, etc.)
   */
  async processStateChange(state: RuntimeState): Promise<TriggerMatch[]> {
    return this.ctx.processStateChange(state);
  }

  // ─── Agent-Facing API (Section 9) ───────────────────────────────

  /** List all available capabilities at index level */
  registry(): RegistryEntry[] {
    return this.ctx.registry();
  }

  /** List mounted capabilities with resolution level and budget usage */
  mounted(): MountedCapability[] {
    return this.ctx.mounted();
  }

  /** Mount a capability. May trigger demotions. */
  async mount(name: string, resolution?: ResolutionLevel): Promise<MountResult | MountError> {
    // Check policy
    if (this.policy) {
      const manifest = this.loader.getManifest(name);
      if (manifest) {
        const maxRes = this.policy.max_resolution?.[name];
        if (maxRes && resolution) {
          const levels: ResolutionLevel[] = ['index', 'summary', 'standard', 'deep'];
          if (levels.indexOf(resolution) > levels.indexOf(maxRes)) {
            resolution = maxRes;
          }
        }
      }
    }

    return this.ctx.mount(name, resolution);
  }

  /** Demote to index, serialize state. Suppresses auto-triggers. */
  async unmount(name: string): Promise<UnmountResult> {
    return this.ctx.unmount(name);
  }

  /** Current resolution, state presence, budget usage, permissions summary */
  status(name: string): CapabilityStatus | null {
    return this.ctx.status(name);
  }

  /** Request human approval for a denied action */
  escalate(tool: string, method: string, reason: string): EscalationRequest {
    return this.ctx.escalate(tool, method, reason);
  }

  /** Resolve an escalation with a human decision */
  resolveEscalation(result: EscalationResult): void {
    this.ctx.resolveEscalation(result);
  }

  /** Check if a tool call is allowed */
  checkPermission(tool: string, method: string, capability?: string) {
    return this.ctx.checkPermission(tool, method, capability);
  }

  /** Update state for a mounted capability */
  updateState(capability: string, fields: Record<string, unknown>): void {
    this.ctx.updateState(capability, fields);
  }

  // ─── Context Generation ──────────────────────────────────────────

  /** Get the current context prompt for injection into agent messages */
  getContext(): string {
    const resolutions = new Map<string, ResolutionLevel>();
    for (const entry of this.ctx.registry()) {
      resolutions.set(entry.name, entry.resolution);
    }
    return this.loader.generateContext(resolutions);
  }

  /** Get a full snapshot of the context state */
  snapshot(): ContextSnapshot {
    return this.ctx.snapshot();
  }

  // ─── Events ──────────────────────────────────────────────────────

  /** Subscribe to lifecycle events */
  on(handler: ACREventHandler): void {
    this.ctx.on(handler);
  }

  /** Clean up session state */
  async cleanup(): Promise<void> {
    await this.ctx.cleanup();
    this.loader.clearCache();
  }
}
