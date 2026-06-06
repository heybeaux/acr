/**
 * OpenClaw Adapter — bridges ACR runtime with OpenClaw's skill system.
 *
 * OpenClaw loads skills as flat SKILL.md files with YAML frontmatter and injects
 * them into the system prompt. This adapter replaces that flat injection with
 * ACR's dynamic context management:
 *
 *   1. Scans skill directories for ACR capabilities (capability.yaml) or legacy skills (SKILL.md)
 *   2. Registers them with the ACR runtime (ContextManager + LODLoader)
 *   3. Generates dynamic context per-turn based on triggers and budget
 *   4. Provides a drop-in replacement for OpenClaw's skill prompt section
 *
 * Usage:
 *   const adapter = new OpenClawAdapter({ windowSize: 128000 });
 *   adapter.loadSkillDirs(['/path/to/skills']);
 *   // Per-turn:
 *   const { context, snapshot } = await adapter.onMessage(userMessage);
 *   // Inject `context` into system prompt where skills section would go
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  CapabilityManifest,
  ResolutionLevel,
  ContextSnapshot,
  TriggerMatch,
  ACREvent,
  ACREventHandler,
  MountResult,
  MountError,
  UnmountResult,
  RuntimeState,
} from '@agentcapabilityruntime/schema';

import { ContextManager } from '../context-manager.js';
import { LODLoader } from '../loader.js';
import { TriggerEngine } from '../trigger-engine.js';
import { detectLegacy } from '../legacy.js';
import { migrateSkill } from '../migrate.js';

export interface OpenClawAdapterConfig {
  /** Context window size in tokens (default: 128000) */
  windowSize?: number;

  /** Tokens reserved for system prompt, identity, conversation history */
  residentBudget?: number;

  /** Maximum tokens for the skills/capabilities section */
  skillsBudget?: number;

  /** Session identifier */
  sessionId?: string;

  /** Default permission policy */
  defaultPermissionPolicy?: 'allow-with-log' | 'deny';

  /** Log ACR events to console */
  verbose?: boolean;
}

export interface SkillLoadResult {
  acr: string[];        // capability.yaml skills loaded natively
  legacy: string[];     // SKILL.md skills loaded via synthetic manifests
  skipped: string[];    // directories with neither
  total: number;
}

export interface TurnResult {
  /** Generated context to inject into the system prompt */
  context: string;

  /** Capabilities that were triggered by this message */
  triggers: TriggerMatch[];

  /** Current state snapshot */
  snapshot: ContextSnapshot;

  /** Token estimate for the generated context */
  tokenEstimate: number;
}

export class OpenClawAdapter {
  private readonly ctx: ContextManager;
  private readonly loader: LODLoader;
  private readonly config: Required<OpenClawAdapterConfig>;
  private readonly eventHandlers: ACREventHandler[] = [];
  private readonly skillDirs: Map<string, string> = new Map(); // name → dir path
  private turnCount = 0;

  constructor(config: OpenClawAdapterConfig = {}) {
    this.config = {
      windowSize: config.windowSize ?? 128000,
      residentBudget: config.residentBudget ?? 10000,
      skillsBudget: config.skillsBudget ?? 30000,
      sessionId: config.sessionId ?? `openclaw_${Date.now().toString(36)}`,
      defaultPermissionPolicy: config.defaultPermissionPolicy ?? 'allow-with-log',
      verbose: config.verbose ?? false,
    };

    this.ctx = new ContextManager({
      windowSize: this.config.skillsBudget,  // ACR manages within the skills budget
      residentBudget: 0,  // resident budget is managed by OpenClaw, not ACR
      defaultPermissionPolicy: this.config.defaultPermissionPolicy,
      sessionId: this.config.sessionId,
    });

    this.loader = new LODLoader();

    if (this.config.verbose) {
      this.ctx.on(event => {
        console.log(`[ACR] ${event.type} ${event.capability ?? ''} ${JSON.stringify(event.details)}`);
      });
    }
  }

  /**
   * Load skill directories — supports both ACR capabilities and legacy SKILL.md files.
   *
   * Scans each directory for subdirectories containing either:
   * - capability.yaml (ACR native)
   * - SKILL.md (legacy, gets synthetic manifest)
   *
   * This replaces OpenClaw's skill scanning phase.
   */
  loadSkillDirs(dirs: string[]): SkillLoadResult {
    const result: SkillLoadResult = { acr: [], legacy: [], skipped: [], total: 0 };

    for (const dir of dirs) {
      if (!existsSync(dir)) continue;

      const entries = readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory());

      for (const entry of entries) {
        const skillDir = join(dir, entry.name);
        const manifestPath = join(skillDir, 'capability.yaml');
        const skillMdPath = join(skillDir, 'SKILL.md');

        if (existsSync(manifestPath)) {
          // ACR native capability
          try {
            const manifest = this.loader.register(skillDir);
            this.ctx.registerCapability(manifest);
            this.skillDirs.set(manifest.name, skillDir);
            result.acr.push(manifest.name);
          } catch (err) {
            console.warn(`[ACR] Failed to load ${entry.name}: ${err}`);
            result.skipped.push(entry.name);
          }
        } else if (existsSync(skillMdPath)) {
          // Legacy SKILL.md — create synthetic manifest
          try {
            const detection = detectLegacy(skillDir);
            if (detection.isLegacy && detection.manifest) {
              this.ctx.registerCapability(detection.manifest);
              this.skillDirs.set(detection.manifest.name, skillDir);
              result.legacy.push(detection.manifest.name);
            }
          } catch (err) {
            console.warn(`[ACR] Failed to load legacy ${entry.name}: ${err}`);
            result.skipped.push(entry.name);
          }
        } else {
          result.skipped.push(entry.name);
        }
      }
    }

    result.total = result.acr.length + result.legacy.length;
    return result;
  }

  /**
   * Process a user message — the per-turn hook.
   *
   * This replaces OpenClaw's static skill injection with dynamic context:
   * 1. Evaluates triggers against the message
   * 2. Auto-mounts matching capabilities
   * 3. Generates context with only relevant capabilities at appropriate resolutions
   *
   * Call this once per user turn and inject the returned `context` into the system prompt.
   */
  async onMessage(message: string): Promise<TurnResult> {
    this.turnCount++;

    // Evaluate triggers
    const triggers = await this.ctx.processMessage(message);

    // Build context from current state
    const context = this.generateSkillsPrompt();
    const snapshot = this.ctx.snapshot();

    return {
      context,
      triggers,
      snapshot,
      tokenEstimate: Math.ceil(context.length / 4),
    };
  }

  /**
   * Process a runtime state change (e.g., new MCP server connected).
   */
  async onStateChange(state: RuntimeState): Promise<TriggerMatch[]> {
    return this.ctx.processStateChange(state);
  }

  /**
   * Manually mount a capability (e.g., user invokes a skill via slash command).
   */
  async mountSkill(name: string, resolution?: ResolutionLevel): Promise<MountResult | MountError> {
    return this.ctx.mount(name, resolution);
  }

  /**
   * Unmount a capability.
   */
  async unmountSkill(name: string): Promise<UnmountResult> {
    return this.ctx.unmount(name);
  }

  /**
   * Generate the skills section of the system prompt.
   *
   * This produces output compatible with OpenClaw's expected format:
   * - XML-like structure with skill names and descriptions
   * - Only includes relevant capabilities at appropriate resolution
   * - Budget-constrained
   */
  generateSkillsPrompt(): string {
    const sections: string[] = [];
    const registry = this.ctx.registry();
    const mounted = this.ctx.mounted();

    // Header
    sections.push('<available_skills>');

    // All capabilities at index level (always included, like OpenClaw's skill list)
    for (const entry of registry) {
      const dir = this.skillDirs.get(entry.name);
      sections.push(`  <skill>`);
      sections.push(`    <name>${entry.name}</name>`);
      sections.push(`    <description>${entry.description}</description>`);
      if (dir) {
        sections.push(`    <location>${join(dir, 'SKILL.md')}</location>`);
      }

      // If mounted above index, include resolution info
      if (entry.resolution !== 'index') {
        sections.push(`    <resolution>${entry.resolution}</resolution>`);
        sections.push(`    <zone>${entry.zone}</zone>`);
      }

      sections.push(`  </skill>`);
    }

    sections.push('</available_skills>');

    // Mounted capabilities get their full content injected
    if (mounted.length > 0) {
      sections.push('\n<active_capabilities>');

      for (const cap of mounted) {
        const dir = this.skillDirs.get(cap.manifest.name);

        sections.push(`\n## ${cap.manifest.name} [${cap.resolution}]`);

        // Try to load actual content from disk
        if (dir) {
          try {
            const loaded = this.loader.load(cap.manifest.name, cap.resolution);
            sections.push(loaded.content);
          } catch {
            // Fallback to resolved behavioral (core + overlays)
            if (cap.manifest.behavioral?.core) {
              sections.push(this.loader.resolveBehavioral(cap.manifest.name));
            }
          }
        } else if (cap.manifest.behavioral?.core) {
          // TODO(persona): apply overlays when loader is available
          sections.push(cap.manifest.behavioral.core);
        }
      }

      sections.push('\n</active_capabilities>');
    }

    return sections.join('\n');
  }

  /**
   * Get current status for debugging/monitoring.
   */
  getStatus(): {
    turnCount: number;
    snapshot: ContextSnapshot;
    loadResult: { acr: number; legacy: number; total: number };
  } {
    const snapshot = this.ctx.snapshot();
    return {
      turnCount: this.turnCount,
      snapshot,
      loadResult: {
        acr: Array.from(this.skillDirs.keys()).length,
        legacy: 0,  // TODO: track separately
        total: snapshot.capabilities.length,
      },
    };
  }

  /**
   * Subscribe to ACR events (for logging, monitoring, framework integration).
   */
  on(handler: ACREventHandler): void {
    this.ctx.on(handler);
  }

  /**
   * Clean up session state.
   */
  async cleanup(): Promise<void> {
    await this.ctx.cleanup();
    this.loader.clearCache();
  }
}
