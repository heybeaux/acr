import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { CapabilityManifest, ResolutionLevel } from '@agentcapabilityruntime/schema';

/**
 * LOD Loader — reads capability content at the requested resolution level.
 *
 * Each capability directory contains resolution files:
 *   index.txt    (~15 tokens)  — one-line description
 *   summary.md   (~200 tokens) — key info
 *   standard.md  (~2K tokens)  — full instructions
 *   deep.md      (~5K tokens)  — with examples + references
 *
 * Inclusivity rule: each level INCLUDES all lower levels.
 * The loader returns only the single file for the requested level.
 */

export interface LoadedCapability {
  manifest: CapabilityManifest;
  resolution: ResolutionLevel;
  content: string;
  tokenEstimate: number;
  path: string;
}

export interface LoaderRegistry {
  capabilities: Map<string, string>;  // name → directory path
}

const RESOLUTION_FILES: Record<ResolutionLevel, string> = {
  index: 'index.txt',
  summary: 'summary.md',
  standard: 'standard.md',
  deep: 'deep.md',
};

// Fallback chain: if requested level doesn't exist, fall back to next lower
const FALLBACK_ORDER: ResolutionLevel[] = ['deep', 'standard', 'summary', 'index'];

export class LODLoader {
  private readonly paths: Map<string, string> = new Map();
  private readonly manifests: Map<string, CapabilityManifest> = new Map();
  private readonly cache: Map<string, LoadedCapability> = new Map();

  /**
   * Register a capability directory.
   * Reads and caches the manifest.
   */
  register(dir: string): CapabilityManifest {
    const manifestPath = join(dir, 'capability.yaml');
    if (!existsSync(manifestPath)) {
      throw new Error(`No capability.yaml found in ${dir}`);
    }

    const raw = readFileSync(manifestPath, 'utf-8');
    const manifest = parseYaml(raw) as CapabilityManifest;

    this.paths.set(manifest.name, dir);
    this.manifests.set(manifest.name, manifest);

    return manifest;
  }

  /**
   * Register multiple capability directories.
   */
  registerAll(dirs: string[]): CapabilityManifest[] {
    return dirs.map(d => this.register(d));
  }

  /**
   * Load a capability at a specific resolution level.
   * Falls back to next lower level if file doesn't exist.
   * Uses cache for repeated loads at the same resolution.
   */
  load(name: string, resolution: ResolutionLevel): LoadedCapability {
    const cacheKey = `${name}:${resolution}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const dir = this.paths.get(name);
    if (!dir) {
      throw new Error(`Capability "${name}" not registered with loader`);
    }

    const manifest = this.manifests.get(name)!;

    // Find the best available resolution file
    const startIdx = FALLBACK_ORDER.indexOf(resolution);
    let actualResolution = resolution;
    let content = '';

    for (let i = startIdx; i < FALLBACK_ORDER.length; i++) {
      const level = FALLBACK_ORDER[i];
      const filePath = join(dir, RESOLUTION_FILES[level]);

      if (existsSync(filePath)) {
        content = readFileSync(filePath, 'utf-8');
        actualResolution = level;
        break;
      }
    }

    if (!content) {
      // Last resort: use behavioral.core from manifest
      content = manifest.behavioral?.core ?? manifest.description;
      actualResolution = 'index';
    }

    const loaded: LoadedCapability = {
      manifest,
      resolution: actualResolution,
      content,
      tokenEstimate: estimateTokens(content),
      path: dir,
    };

    this.cache.set(cacheKey, loaded);
    return loaded;
  }

  /**
   * Load all registered capabilities at their specified resolutions.
   */
  loadAll(resolutions: Map<string, ResolutionLevel>): LoadedCapability[] {
    const loaded: LoadedCapability[] = [];

    for (const [name, resolution] of resolutions) {
      loaded.push(this.load(name, resolution));
    }

    return loaded;
  }

  /**
   * Generate a combined context block from loaded capabilities.
   * Includes constraints block, the capability registry (all at index), plus mounted capabilities.
   */
  generateContext(resolutions: Map<string, ResolutionLevel>): string {
    const sections: string[] = [];

    // Collect constraints from all mounted capabilities (summary or higher)
    const allConstraints: { capability: string; rules: string[] }[] = [];
    for (const [name, resolution] of resolutions) {
      if (resolution === 'index') continue;
      const manifest = this.manifests.get(name);
      if (manifest?.constraints?.length) {
        allConstraints.push({ capability: name, rules: manifest.constraints });
      }
    }

    // Constraints block — injected FIRST for maximum model attention
    if (allConstraints.length > 0) {
      sections.push('## ⚠️ CONSTRAINTS (MUST follow)\n');
      for (const { capability, rules } of allConstraints) {
        for (const rule of rules) {
          sections.push(`- **[${capability}]** ${rule}`);
        }
      }
      sections.push('');
    }

    // Registry header — all capabilities at index level
    sections.push('## Capability Registry\n');
    for (const [name] of this.manifests) {
      const indexContent = this.load(name, 'index');
      sections.push(`- ${indexContent.content.trim()}`);
    }
    sections.push('');

    // Mounted capabilities (above index level)
    for (const [name, resolution] of resolutions) {
      if (resolution === 'index') continue;

      const loaded = this.load(name, resolution);
      sections.push(`---\n## ${name} [${loaded.resolution}]\n`);
      sections.push(loaded.content);
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Get a manifest by name.
   */
  getManifest(name: string): CapabilityManifest | undefined {
    return this.manifests.get(name);
  }

  /**
   * Get all registered manifests.
   */
  getAllManifests(): CapabilityManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * Clear the content cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get stats about the loader.
   */
  get stats() {
    return {
      registered: this.manifests.size,
      cached: this.cache.size,
    };
  }
}

function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}
