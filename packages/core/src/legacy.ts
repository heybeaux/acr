import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { CapabilityManifest } from '@agentcapabilityruntime/schema';

export interface LegacyDetectionResult {
  isLegacy: boolean;
  hasManifest: boolean;
  hasSkillMd: boolean;
  name: string;
  path: string;
  manifest?: CapabilityManifest;
  warning?: string;
}

/**
 * Detect whether a directory contains a legacy skill (SKILL.md without capability.yaml)
 * and generate a synthetic manifest for backward compatibility.
 */
export function detectLegacy(dir: string): LegacyDetectionResult {
  const name = basename(dir);
  const hasManifest = existsSync(join(dir, 'capability.yaml'));
  const hasSkillMd = existsSync(join(dir, 'SKILL.md'));

  if (hasManifest) {
    return {
      isLegacy: false,
      hasManifest: true,
      hasSkillMd,
      name,
      path: dir,
    };
  }

  if (!hasSkillMd) {
    return {
      isLegacy: false,
      hasManifest: false,
      hasSkillMd: false,
      name,
      path: dir,
    };
  }

  // Legacy skill detected — generate synthetic manifest
  const content = readFileSync(join(dir, 'SKILL.md'), 'utf-8');
  const { parsedName, description } = parseLegacyFrontmatter(content);
  const inferredName = parsedName || name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const inferredDesc = description || `${inferredName} (legacy skill)`;

  // Estimate token count
  const words = content.split(/\s+/).length;
  const estimatedTokens = Math.ceil(words * 1.3);

  const manifest: CapabilityManifest = {
    name: inferredName,
    version: '0.0.0',
    type: 'capability',
    description: inferredDesc,
    provides: [inferredName],
    budget: {
      index: Math.min(Math.ceil(inferredDesc.split(/\s+/).length * 1.3), 50),
      summary: Math.min(estimatedTokens, 500),
      standard: estimatedTokens,
    },
    behavioral: {
      core: `Legacy skill. See SKILL.md for full instructions.`,
    },
  };

  return {
    isLegacy: true,
    hasManifest: false,
    hasSkillMd: true,
    name: inferredName,
    path: dir,
    manifest,
    warning: `Legacy skill detected: ${inferredName}. Run \`acr migrate ${join(dir, 'SKILL.md')}\` to convert to ACR format.`,
  };
}

/**
 * Scan a directory for all capabilities (ACR + legacy).
 * Returns manifests for both, with legacy skills getting synthetic manifests.
 */
export function scanCapabilities(baseDir: string): {
  manifests: CapabilityManifest[];
  legacyWarnings: string[];
} {
  const { readdirSync } = require('node:fs');
  const { parse: parseYaml } = require('yaml');

  const entries = readdirSync(baseDir, { withFileTypes: true })
    .filter((e: any) => e.isDirectory());

  const manifests: CapabilityManifest[] = [];
  const legacyWarnings: string[] = [];

  for (const entry of entries) {
    const dir = join(baseDir, entry.name);
    const manifestPath = join(dir, 'capability.yaml');

    if (existsSync(manifestPath)) {
      // ACR capability
      const raw = readFileSync(manifestPath, 'utf-8');
      manifests.push(parseYaml(raw) as CapabilityManifest);
    } else {
      // Check for legacy
      const result = detectLegacy(dir);
      if (result.isLegacy && result.manifest) {
        manifests.push(result.manifest);
        if (result.warning) {
          legacyWarnings.push(result.warning);
        }
      }
    }
  }

  return { manifests, legacyWarnings };
}

function parseLegacyFrontmatter(content: string): {
  parsedName: string;
  description: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { parsedName: '', description: '' };

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/name:\s*(.+)/);
  const descMatch = frontmatter.match(/description:\s*"?([^"\n]+)"?/);

  return {
    parsedName: nameMatch?.[1]?.trim() || '',
    description: descMatch?.[1]?.trim() || '',
  };
}
