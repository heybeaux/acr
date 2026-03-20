/**
 * Task Resolver — resolve capabilities from a task/ticket description.
 *
 * Designed for Factory-style worker spawning:
 *   1. Parse task description for tech stack hints and intent
 *   2. Resolve the right capabilities at the right resolutions
 *   3. Generate ready-to-inject context for buildPrompt()
 *
 * Resolution happens ONCE at spawn time, not per-turn.
 */

import type {
  CapabilityManifest,
  ResolutionLevel,
} from '@acr/schema';

import { LODLoader } from './loader.js';
import { TriggerEngine } from './trigger-engine.js';
import { resolve as resolveCapabilities } from './resolver.js';
import { countTokens } from './tokenizer.js';

export interface TaskResolution {
  /** Capabilities selected for this task, with resolution levels */
  capabilities: TaskCapability[];

  /** Generated context block ready to inject into the worker prompt */
  context: string;

  /** Total token cost of the generated context */
  tokenCost: number;

  /** Why each capability was selected */
  reasoning: string[];

  /** Capabilities that were considered but excluded */
  excluded: string[];

  /** Model preferences from selected capabilities (highest priority wins) */
  modelPreferences: ModelPreferenceMap;
}

export interface ModelPreferenceMap {
  /** Resolved preferred model (from highest-priority capability that declares one) */
  preferred?: string;
  /** Resolved fallback model */
  fallback?: string;
  /** All hard constraints that must be satisfied */
  constraints: string[];
  /** Per-capability model preferences (for multi-agent spawning) */
  perCapability: Record<string, { preferred?: string; fallback?: string | null; constraint?: string }>;
}

export interface TaskCapability {
  name: string;
  resolution: ResolutionLevel;
  reason: string;  // why this was selected
  tokens: number;
}

export interface TaskResolverConfig {
  /** Maximum tokens to allocate for capabilities (default: 15000) */
  maxBudget?: number;

  /** Default resolution for matched capabilities (default: 'standard') */
  defaultResolution?: ResolutionLevel;

  /** Resolution for the primary/strongest match (default: 'deep') */
  primaryResolution?: ResolutionLevel;

  /** Minimum semantic similarity to include (default: 0.3) */
  semanticThreshold?: number;

  /** Maximum capabilities to include (default: 8) */
  maxCapabilities?: number;

  /** Minimum score to include a capability (default: 0 — include any match) */
  minScore?: number;

  /** Output file paths for file-pattern-aware priority boosting */
  outputFiles?: string[];
}

interface ScoredCapability {
  manifest: CapabilityManifest;
  score: number;
  reasons: string[];
  isPrimary: boolean;
}

/**
 * Resolve capabilities for a task description.
 *
 * Uses a multi-signal scoring approach:
 *   - Keyword extraction from the task
 *   - Regex trigger matching
 *   - Semantic similarity against capability descriptions
 *   - Dependency chain resolution
 */
export class TaskResolver {
  private readonly loader: LODLoader;
  private readonly triggerEngine: TriggerEngine;
  private readonly config: Required<TaskResolverConfig>;

  constructor(loader: LODLoader, config: TaskResolverConfig = {}) {
    this.loader = loader;
    this.triggerEngine = new TriggerEngine();
    this.config = {
      maxBudget: config.maxBudget ?? 15000,
      defaultResolution: config.defaultResolution ?? 'standard',
      primaryResolution: config.primaryResolution ?? 'deep',
      semanticThreshold: config.semanticThreshold ?? 0.3,
      maxCapabilities: config.maxCapabilities ?? 8,
      minScore: config.minScore ?? 0,
      outputFiles: config.outputFiles ?? [],
    };

    // Register all manifests with the trigger engine
    for (const manifest of loader.getAllManifests()) {
      this.triggerEngine.register(manifest);
    }
  }

  /**
   * Resolve capabilities for a task/ticket description.
   */
  resolve(taskDescription: string): TaskResolution {
    const manifests = this.loader.getAllManifests();
    const scored = this.scoreCapabilities(taskDescription, manifests);

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Select top capabilities within budget
    const selected: TaskCapability[] = [];
    const excluded: string[] = [];
    const reasoning: string[] = [];
    let budgetUsed = 0;

    for (const cap of scored) {
      if (selected.length >= this.config.maxCapabilities) {
        excluded.push(cap.manifest.name);
        continue;
      }

      const resolution = cap.isPrimary
        ? this.config.primaryResolution
        : this.config.defaultResolution;

      const budget = this.getBudget(cap.manifest, resolution);

      if (budgetUsed + budget > this.config.maxBudget) {
        // Try at a lower resolution
        const fallback = this.getFallbackResolution(resolution);
        const fallbackBudget = this.getBudget(cap.manifest, fallback);

        if (budgetUsed + fallbackBudget <= this.config.maxBudget) {
          selected.push({
            name: cap.manifest.name,
            resolution: fallback,
            reason: cap.reasons.join('; '),
            tokens: fallbackBudget,
          });
          budgetUsed += fallbackBudget;
          reasoning.push(`${cap.manifest.name}: ${fallback} (demoted from ${resolution} for budget) — ${cap.reasons.join('; ')}`);
        } else {
          excluded.push(cap.manifest.name);
        }
        continue;
      }

      selected.push({
        name: cap.manifest.name,
        resolution,
        reason: cap.reasons.join('; '),
        tokens: budget,
      });
      budgetUsed += budget;
      reasoning.push(`${cap.manifest.name}: ${resolution} — ${cap.reasons.join('; ')}`);
    }

    // Resolve dependencies
    for (const cap of [...selected]) {
      const manifest = manifests.find(m => m.name === cap.name);
      if (!manifest?.requires?.capabilities) continue;

      for (const dep of manifest.requires.capabilities) {
        if (selected.find(s => s.name === dep.name)) continue;

        const depManifest = manifests.find(m => m.name === dep.name);
        if (!depManifest) continue;

        const depResolution = dep.resolution ?? 'summary';
        const depBudget = this.getBudget(depManifest, depResolution);

        if (budgetUsed + depBudget <= this.config.maxBudget) {
          selected.push({
            name: dep.name,
            resolution: depResolution,
            reason: `dependency of ${cap.name}`,
            tokens: depBudget,
          });
          budgetUsed += depBudget;
          reasoning.push(`${dep.name}: ${depResolution} — dependency of ${cap.name}`);
        }
      }
    }

    // Generate context
    const context = this.generateContext(selected);
    const tokenCost = countTokens(context);

    // Collect model preferences from selected capabilities
    const modelPreferences = this.collectModelPreferences(selected);

    return {
      capabilities: selected,
      context,
      tokenCost,
      reasoning,
      excluded,
      modelPreferences,
    };
  }

  /**
   * Collect model preferences from resolved capabilities.
   * Highest-priority capability's model wins for the top-level preferred/fallback.
   * All hard constraints are aggregated.
   */
  private collectModelPreferences(capabilities: TaskCapability[]): ModelPreferenceMap {
    const priorityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const perCapability: Record<string, { preferred?: string; fallback?: string | null; constraint?: string }> = {};
    const constraints: string[] = [];
    let preferred: string | undefined;
    let fallback: string | undefined;
    let bestPriority = 0;

    for (const cap of capabilities) {
      const manifest = this.loader.getManifest(cap.name);
      if (!manifest?.model) continue;

      const model = manifest.model;
      perCapability[cap.name] = {
        preferred: model.preferred,
        fallback: model.fallback,
        constraint: model.constraint,
      };

      if (model.constraint && !constraints.includes(model.constraint)) {
        constraints.push(model.constraint);
      }

      // Highest priority capability's model wins top-level preference
      const priority = priorityOrder[manifest.priority ?? 'medium'] ?? 2;
      if (model.preferred && priority > bestPriority) {
        preferred = model.preferred;
        fallback = model.fallback ?? undefined;
        bestPriority = priority;
      }
    }

    return { preferred, fallback, constraints, perCapability };
  }

  /**
   * Score capabilities against a task description using multiple signals.
   */
  private scoreCapabilities(
    task: string,
    manifests: CapabilityManifest[],
  ): ScoredCapability[] {
    const results: ScoredCapability[] = [];

    // Get trigger matches
    const triggerMatches = this.triggerEngine.evaluatePatterns(task);
    const triggerMap = new Map(triggerMatches.map(m => [m.capabilityName, m]));

    // Extract tech keywords from task
    const taskLower = task.toLowerCase();
    const techKeywords = extractTechKeywords(taskLower);

    for (const manifest of manifests) {
      let score = 0;
      const reasons: string[] = [];
      let isPrimary = false;

      // Signal 1: Trigger match (strongest signal)
      const trigger = triggerMap.get(manifest.name);
      if (trigger) {
        if (trigger.triggerType === 'pattern') {
          score += 50;
          reasons.push(`pattern match: "${trigger.matchedText}"`);
          isPrimary = true;
        } else if (trigger.triggerType === 'semantic') {
          score += 30;
          reasons.push(`semantic match: ${trigger.matchedText}`);
        }
      }

      // Signal 2: Name/provides keyword match
      const nameTokens = manifest.name.toLowerCase().split(/[-_.]/);
      for (const token of nameTokens) {
        if (token.length > 2 && taskLower.includes(token)) {
          score += 20;
          reasons.push(`name keyword: "${token}"`);
          if (score >= 40) isPrimary = true;
        }
      }

      for (const provides of manifest.provides) {
        const provideTokens = provides.toLowerCase().split(/[-_.]/);
        for (const token of provideTokens) {
          if (token.length > 2 && taskLower.includes(token)) {
            score += 15;
            reasons.push(`provides: "${provides}"`);
          }
        }
      }

      // Signal 3: Tech stack keyword matching
      // Check name, provides, AND description (but only for specific tech terms, not generic ones)
      const genericTerms = new Set(['test', 'testing', 'api', 'deploy', 'schema', 'migration',
        'auth', 'authentication', 'security', 'review', 'ci', 'cd', 'pipeline', 'endpoint',
        'audit', 'code review', 'webhook', 'cron', 'memory', 'vector']);

      for (const keyword of techKeywords) {
        const nameLower = manifest.name.toLowerCase();
        const providesLower = manifest.provides.map((p: string) => p.toLowerCase());
        const descLower = manifest.description.toLowerCase();
        const nameMatch = nameLower.includes(keyword);
        const providesMatch = providesLower.some((p: string) => p.includes(keyword));
        const isSpecific = !genericTerms.has(keyword);
        const descMatch = isSpecific && descLower.includes(keyword);

        if (nameMatch) {
          score += 25;
          reasons.push(`tech stack in name: "${keyword}"`);
          if (score >= 40) isPrimary = true;
        } else if (providesMatch) {
          score += 15;
          reasons.push(`tech stack in provides: "${keyword}"`);
        } else if (descMatch) {
          score += 15;
          reasons.push(`tech stack in description: "${keyword}"`);
          if (score >= 40) isPrimary = true;
        }
      }

      // Signal 4: File pattern matching (output files → capability file_patterns)
      if (this.config.outputFiles.length > 0 && manifest.file_patterns) {
        for (const pattern of manifest.file_patterns) {
          for (const file of this.config.outputFiles) {
            if (fileMatchesPattern(file, pattern)) {
              score += 40;
              reasons.push(`file pattern match: "${pattern}" → "${file}"`);
              isPrimary = true;
            }
          }
        }
      }

      // Only include capabilities above minimum score threshold
      if (score > this.config.minScore) {
        results.push({ manifest, score, reasons, isPrimary });
      }
    }

    return results;
  }

  /**
   * Generate the context block for worker injection.
   * Constraints are injected as a dedicated CRITICAL section before capability content.
   */
  private generateContext(capabilities: TaskCapability[]): string {
    const sections: string[] = [];

    // Collect all constraints from selected capabilities
    const allConstraints: { capability: string; rules: string[] }[] = [];
    for (const cap of capabilities) {
      const manifest = this.loader.getManifest(cap.name);
      if (manifest?.constraints?.length) {
        allConstraints.push({ capability: cap.name, rules: manifest.constraints });
      }
    }

    // Inject constraints block FIRST — before any capability content
    if (allConstraints.length > 0) {
      sections.push('## ⚠️ CONSTRAINTS (MUST follow)');
      sections.push('');
      for (const { capability, rules } of allConstraints) {
        for (const rule of rules) {
          sections.push(`- **[${capability}]** ${rule}`);
        }
      }
      sections.push('');
    }

    sections.push('## Capability Context');
    sections.push('');
    sections.push('The following capabilities are available for this task:');
    sections.push('');

    for (const cap of capabilities) {
      try {
        const loaded = this.loader.load(cap.name, cap.resolution);
        sections.push(`### ${cap.name} [${cap.resolution}]`);
        sections.push('');
        sections.push(loaded.content);
        sections.push('');
      } catch {
        // Fallback to manifest description
        const manifest = this.loader.getManifest(cap.name);
        if (manifest?.behavioral?.core) {
          sections.push(`### ${cap.name} [${cap.resolution}]`);
          sections.push('');
          sections.push(manifest.behavioral.core);
          sections.push('');
        }
      }
    }

    return sections.join('\n');
  }

  private getBudget(manifest: CapabilityManifest, resolution: ResolutionLevel): number {
    switch (resolution) {
      case 'deep': return manifest.budget.deep ?? manifest.budget.standard;
      case 'standard': return manifest.budget.standard;
      case 'summary': return manifest.budget.summary;
      case 'index': return manifest.budget.index;
    }
  }

  private getFallbackResolution(resolution: ResolutionLevel): ResolutionLevel {
    switch (resolution) {
      case 'deep': return 'standard';
      case 'standard': return 'summary';
      case 'summary': return 'index';
      case 'index': return 'index';
    }
  }
}

/**
 * Check if a filename matches a file pattern.
 * Supports: exact extension ('.stories.tsx'), glob-like ('*.test.*'), and substring matching.
 */
function fileMatchesPattern(filePath: string, pattern: string): boolean {
  const fileName = filePath.split('/').pop() ?? filePath;

  // Exact extension match (e.g., '.stories.tsx' matches 'Button.stories.tsx')
  if (pattern.startsWith('.') && !pattern.includes('*')) {
    return fileName.endsWith(pattern);
  }

  // Glob-like pattern: convert to regex
  if (pattern.includes('*')) {
    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    return new RegExp(regexStr).test(fileName);
  }

  // Substring match
  return fileName.includes(pattern);
}

/**
 * Extract technology keywords from a task description.
 * These are high-signal terms that strongly indicate which capabilities are needed.
 */
function extractTechKeywords(text: string): string[] {
  const TECH_PATTERNS = [
    // Frameworks
    'nestjs', 'nest', 'nextjs', 'next.js', 'react', 'angular', 'vue', 'svelte', 'astro',
    'express', 'fastify', 'hono', 'django', 'flask', 'rails',
    // Databases
    'prisma', 'supabase', 'postgres', 'postgresql', 'mongodb', 'redis', 'sqlite',
    'drizzle', 'typeorm', 'sequelize', 'knex', 'pinecone',
    // APIs/Services
    'stripe', 'salesforce', 'linear', 'github', 'gitlab', 'slack', 'discord',
    'linkedin', 'twitter', 'figma', 'firebase',
    // Tools
    'docker', 'kubernetes', 'terraform', 'ansible', 'nginx',
    // Languages
    'typescript', 'python', 'rust', 'golang',
    // Concepts
    'authentication', 'auth', 'oauth', 'jwt', 'rls', 'row level security',
    'migration', 'schema', 'endpoint', 'api', 'webhook', 'cron',
    'ci', 'cd', 'pipeline', 'deploy', 'test', 'testing',
    'security', 'audit', 'review', 'code review',
    // Database concepts
    'database', 'introspect', 'introspection', 'erd', 'foreign key',
    // AI/Memory
    'engram', 'memory', 'embedding', 'vector', 'recall',
  ];

  return TECH_PATTERNS.filter(keyword => text.includes(keyword));
}
