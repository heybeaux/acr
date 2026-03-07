/**
 * ACR Capability Registry
 *
 * Local registry for discovering, searching, and managing capabilities.
 * MVP: file-based registry index, local search.
 * Future: remote registry (acr.heybeaux.dev), publishing, versioning.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { CapabilityManifest } from '@acr/schema';

export interface RegistryIndex {
  version: number;
  updatedAt: number;
  capabilities: RegistryCapability[];
}

export interface RegistryCapability {
  name: string;
  version: string;
  type: string;
  description: string;
  provides: string[];
  path: string;
  budget: {
    index: number;
    summary: number;
    standard: number;
    deep?: number;
  };
  priority?: string;
}

export interface SearchResult {
  capability: RegistryCapability;
  score: number;
  matchedOn: string[];
}

/**
 * Build or update a registry index from a capabilities directory.
 */
export function buildIndex(capabilitiesDir: string): RegistryIndex {
  const capabilities: RegistryCapability[] = [];

  const entries = readdirSync(capabilitiesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = join(capabilitiesDir, entry.name, 'capability.yaml');
    if (!existsSync(manifestPath)) continue;

    try {
      const raw = readFileSync(manifestPath, 'utf-8');
      const manifest = parseYaml(raw) as CapabilityManifest;

      capabilities.push({
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        description: manifest.description,
        provides: manifest.provides || [],
        path: join(capabilitiesDir, entry.name),
        budget: manifest.budget,
        priority: manifest.priority,
      });
    } catch {
      // Skip invalid manifests
    }
  }

  return {
    version: 1,
    updatedAt: Date.now(),
    capabilities,
  };
}

/**
 * Save registry index to a file.
 */
export function saveIndex(index: RegistryIndex, path: string): void {
  const dir = join(path, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Load registry index from a file.
 */
export function loadIndex(path: string): RegistryIndex | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Search the registry for capabilities matching a query.
 */
export function searchRegistry(
  index: RegistryIndex,
  query: string,
): SearchResult[] {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 1);
  const results: SearchResult[] = [];

  for (const cap of index.capabilities) {
    let score = 0;
    const matchedOn: string[] = [];

    // Exact name match
    if (cap.name.toLowerCase() === queryLower) {
      score += 100;
      matchedOn.push('name (exact)');
    }

    // Name contains query
    if (cap.name.toLowerCase().includes(queryLower)) {
      score += 50;
      matchedOn.push('name');
    }

    // Provides match
    for (const provides of cap.provides) {
      if (provides.toLowerCase().includes(queryLower)) {
        score += 40;
        matchedOn.push(`provides: ${provides}`);
      }
    }

    // Description match
    const descLower = cap.description.toLowerCase();
    for (const term of queryTerms) {
      if (descLower.includes(term)) {
        score += 20;
        matchedOn.push(`description: "${term}"`);
      }
    }

    // Term-by-term name matching
    for (const term of queryTerms) {
      if (cap.name.toLowerCase().includes(term)) {
        score += 15;
        if (!matchedOn.includes('name')) matchedOn.push(`name: "${term}"`);
      }
    }

    if (score > 0) {
      results.push({ capability: cap, score, matchedOn });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Format search results for console output.
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return '  No capabilities found.';

  const lines: string[] = [];

  for (const result of results) {
    const cap = result.capability;
    const budgetStr = `${cap.budget.standard} tok`;
    lines.push(`  ${cap.name} (v${cap.version}) — ${budgetStr}`);
    lines.push(`    ${cap.description}`);
    if (cap.provides.length > 0) {
      lines.push(`    provides: ${cap.provides.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
