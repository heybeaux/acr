import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LODLoader } from '../loader.js';
import type { ACRError } from '@agentcapabilityruntime/schema';

function writeCapability(dir: string, manifest: object): void {
  const yaml = Object.entries(manifest)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  writeFileSync(join(dir, 'capability.yaml'), yaml, 'utf-8');
}

function makeCapabilityYaml(
  name: string,
  core: string,
  overlays?: Array<{ ref: string; optional?: boolean; priority?: number }>,
): string {
  const lines = [
    `name: ${name}`,
    `version: "1.0.0"`,
    `type: capability`,
    `description: "${name} capability"`,
    `provides:\n  - ${name}`,
    `budget:\n  index: 10\n  summary: 100\n  standard: 500\n  deep: 1500`,
    `behavioral:\n  core: "${core}"`,
  ];

  if (overlays && overlays.length > 0) {
    lines.push('  overlays:');
    for (const o of overlays) {
      lines.push(`    - ref: ${o.ref}`);
      if (o.optional !== undefined) lines.push(`      optional: ${o.optional}`);
      if (o.priority !== undefined) lines.push(`      priority: ${o.priority}`);
    }
  }

  return lines.join('\n');
}

describe('LODLoader.resolveBehavioral', () => {
  let tmpDir: string;
  let loader: LODLoader;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'acr-overlay-test-'));
    loader = new LODLoader();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function createCapability(
    name: string,
    core: string,
    overlays?: Array<{ ref: string; optional?: boolean; priority?: number }>,
    overlayFiles?: Record<string, string>,
  ): string {
    const capDir = join(tmpDir, name);
    mkdirSync(capDir);
    writeFileSync(join(capDir, 'capability.yaml'), makeCapabilityYaml(name, core, overlays), 'utf-8');

    if (overlayFiles) {
      const overlaysDir = join(capDir, 'overlays');
      mkdirSync(overlaysDir);
      for (const [filename, content] of Object.entries(overlayFiles)) {
        writeFileSync(join(overlaysDir, filename), content, 'utf-8');
      }
    }

    return capDir;
  }

  it('returns core unchanged when manifest has no overlays', () => {
    const dir = createCapability('cap-no-overlays', 'Base behavior.');
    loader.register(dir);
    expect(loader.resolveBehavioral('cap-no-overlays')).toBe('Base behavior.');
  });

  it('returns core + overlay section for a single overlay', () => {
    const dir = createCapability(
      'cap-one-overlay',
      'Base behavior.',
      [{ ref: 'tone' }],
      { 'tone.md': 'Be friendly.' },
    );
    loader.register(dir);
    const result = loader.resolveBehavioral('cap-one-overlay');
    expect(result).toBe('Base behavior.\n\n## Overlay: tone\nBe friendly.');
  });

  it('applies overlays in ascending priority order (priority-10 after priority-5)', () => {
    const dir = createCapability(
      'cap-priority-order',
      'Base.',
      [
        { ref: 'high', priority: 10 },
        { ref: 'low', priority: 5 },
      ],
      { 'low.md': 'Low priority content.', 'high.md': 'High priority content.' },
    );
    loader.register(dir);
    const result = loader.resolveBehavioral('cap-priority-order');
    const lowIdx = result.indexOf('Low priority content.');
    const highIdx = result.indexOf('High priority content.');
    expect(lowIdx).toBeGreaterThanOrEqual(0);
    expect(highIdx).toBeGreaterThanOrEqual(0);
    expect(lowIdx).toBeLessThan(highIdx);
  });

  it('applies overlays with same priority in array order', () => {
    const dir = createCapability(
      'cap-same-priority',
      'Base.',
      [
        { ref: 'first', priority: 5 },
        { ref: 'second', priority: 5 },
      ],
      { 'first.md': 'First content.', 'second.md': 'Second content.' },
    );
    loader.register(dir);
    const result = loader.resolveBehavioral('cap-same-priority');
    expect(result.indexOf('First content.')).toBeLessThan(result.indexOf('Second content.'));
  });

  it('treats an overlay with no priority as priority 0, applied before priority-1', () => {
    const dir = createCapability(
      'cap-default-priority',
      'Base.',
      [
        { ref: 'explicit-one', priority: 1 },
        { ref: 'default-zero' },
      ],
      { 'default-zero.md': 'Default zero.', 'explicit-one.md': 'Explicit one.' },
    );
    loader.register(dir);
    const result = loader.resolveBehavioral('cap-default-priority');
    expect(result.indexOf('Default zero.')).toBeLessThan(result.indexOf('Explicit one.'));
  });

  it('skips optional overlay with missing file without throwing', () => {
    const dir = createCapability(
      'cap-optional-missing',
      'Base.',
      [{ ref: 'missing-optional', optional: true }],
    );
    loader.register(dir);
    const result = loader.resolveBehavioral('cap-optional-missing');
    expect(result).toBe('Base.');
  });

  it('throws ACRError MANIFEST_INVALID for non-optional overlay with missing file', () => {
    const dir = createCapability(
      'cap-required-missing',
      'Base.',
      [{ ref: 'missing-required' }],
    );
    loader.register(dir);

    let thrown: unknown;
    try {
      loader.resolveBehavioral('cap-required-missing');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    const err = thrown as ACRError;
    expect(err.code).toBe('MANIFEST_INVALID');
    expect(err.message).toContain('cap-required-missing');
    expect(err.message).toContain('missing-required');
  });

  it('throws for unregistered capability name', () => {
    expect(() => loader.resolveBehavioral('nonexistent')).toThrow(
      'Capability "nonexistent" not registered with loader',
    );
  });

  it('returns description when manifest has no behavioral.core', () => {
    const capDir = join(tmpDir, 'cap-no-core');
    mkdirSync(capDir);
    const yaml = [
      'name: cap-no-core',
      'version: "1.0.0"',
      'type: capability',
      'description: "No core cap"',
      'provides:\n  - cap-no-core',
      'budget:\n  index: 10\n  summary: 100\n  standard: 500\n  deep: 1500',
    ].join('\n');
    writeFileSync(join(capDir, 'capability.yaml'), yaml, 'utf-8');
    loader.register(capDir);
    expect(loader.resolveBehavioral('cap-no-core')).toBe('No core cap');
  });
});
