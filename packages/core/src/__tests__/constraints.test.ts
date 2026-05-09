import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { TaskResolver } from '../task-resolver.js';
import { LODLoader } from '../loader.js';
import { ContextManager } from '../context-manager.js';
import { lintCapability } from '../linter.js';
import type { CapabilityManifest } from '@agentcapabilityruntime/schema';

const EXAMPLES_DIR = join(__dirname, '..', '..', '..', '..', 'examples');
const MIGRATION_DIR = join(__dirname, '..', '..', '..', '..', 'migration-output');

describe('Constraints — Kit\'s Storybook Bug', () => {
  let loader: LODLoader;
  let resolver: TaskResolver;

  beforeEach(() => {
    loader = new LODLoader();
    loader.registerAll([
      join(EXAMPLES_DIR, 'gc-storybook'),
      join(MIGRATION_DIR, 'nestjs'),
      join(MIGRATION_DIR, 'nextjs'),
      join(MIGRATION_DIR, 'code-review'),
    ]);
  });

  it('injects constraints block at top of generated context', () => {
    resolver = new TaskResolver(loader);
    const result = resolver.resolve('Create Storybook stories for the TeamCard component');

    expect(result.context).toContain('⚠️ CONSTRAINTS (MUST follow)');
    expect(result.context).toContain('NEVER import from @storybook/react');
    expect(result.context).toContain('@storybook/nextjs');

    // Constraints should appear BEFORE capability content
    const constraintsIdx = result.context.indexOf('CONSTRAINTS');
    const capabilityIdx = result.context.indexOf('## Capability Context');
    expect(constraintsIdx).toBeLessThan(capabilityIdx);
  });

  it('resolves gc-storybook via pattern trigger', () => {
    resolver = new TaskResolver(loader);
    const result = resolver.resolve('Write storybook stories for the Button component');

    const names = result.capabilities.map(c => c.name);
    expect(names).toContain('gc-storybook');
  });

  it('boosts priority via file_patterns when outputFiles provided', () => {
    resolver = new TaskResolver(loader, {
      outputFiles: ['src/components/TeamCard.stories.tsx'],
    });
    const result = resolver.resolve('Create the TeamCard component');

    const names = result.capabilities.map(c => c.name);
    expect(names).toContain('gc-storybook');

    // Should be primary (deep resolution) due to file pattern match
    const storybook = result.capabilities.find(c => c.name === 'gc-storybook');
    expect(storybook?.resolution).toBe('deep');
  });

  it('does not boost when file patterns do not match', () => {
    resolver = new TaskResolver(loader, {
      outputFiles: ['src/services/auth.service.ts'],
    });
    const result = resolver.resolve('Create the auth service');

    const names = result.capabilities.map(c => c.name);
    expect(names).not.toContain('gc-storybook');
  });

  it('file pattern match works with various extensions', () => {
    resolver = new TaskResolver(loader, {
      outputFiles: ['Button.stories.jsx'],
    });
    const result = resolver.resolve('Create component file');

    const names = result.capabilities.map(c => c.name);
    expect(names).toContain('gc-storybook');
  });
});

describe('Constraints — LODLoader context generation', () => {
  let loader: LODLoader;

  beforeEach(() => {
    loader = new LODLoader();
    loader.registerAll([
      join(EXAMPLES_DIR, 'gc-storybook'),
      join(MIGRATION_DIR, 'nestjs'),
    ]);
  });

  it('includes constraints in generated context at summary+ resolution', () => {
    const resolutions = new Map<string, string>([
      ['gc-storybook', 'standard'],
      ['nestjs', 'summary'],
    ]) as Map<string, any>;

    const context = loader.generateContext(resolutions);

    expect(context).toContain('⚠️ CONSTRAINTS (MUST follow)');
    expect(context).toContain('NEVER import from @storybook/react');
  });

  it('does not include constraints when capability is at index resolution', () => {
    const resolutions = new Map<string, string>([
      ['gc-storybook', 'index'],
      ['nestjs', 'summary'],
    ]) as Map<string, any>;

    const context = loader.generateContext(resolutions);

    // Should NOT have constraints since gc-storybook is at index
    expect(context).not.toContain('NEVER import from @storybook/react');
  });
});

describe('Constraints — ContextManager context generation', () => {
  it('includes constraints block in generated context for mounted capabilities', async () => {
    const manager = new ContextManager({
      windowSize: 128000,
      residentBudget: 5000,
      defaultPermissionPolicy: 'allow-with-log',
      sessionId: 'test-constraints',
    });

    const manifest: CapabilityManifest = {
      name: 'test-storybook',
      version: '1.0.0',
      type: 'capability',
      description: 'Test capability with constraints',
      provides: ['storybook'],
      budget: { index: 10, summary: 100, standard: 500 },
      behavioral: { core: 'Write Storybook stories.' },
      constraints: [
        'NEVER import from @storybook/react — use @storybook/nextjs',
        'ALWAYS use CSF3 format for stories',
      ],
    };

    manager.registerCapability(manifest);
    await manager.mount('test-storybook', 'standard');

    const context = manager.generateContext();

    expect(context).toContain('⚠️ CONSTRAINTS (MUST follow)');
    expect(context).toContain('NEVER import from @storybook/react');
    expect(context).toContain('ALWAYS use CSF3 format');
    expect(context).toContain('[test-storybook]');

    // Constraints should appear before capability content
    const constraintsIdx = context.indexOf('CONSTRAINTS');
    const capIdx = context.indexOf('Available Capabilities');
    expect(constraintsIdx).toBeLessThan(capIdx);
  });

  it('does not include constraints block when no capabilities have constraints', async () => {
    const manager = new ContextManager({
      windowSize: 128000,
      residentBudget: 5000,
      defaultPermissionPolicy: 'allow-with-log',
      sessionId: 'test-no-constraints',
    });

    const manifest: CapabilityManifest = {
      name: 'plain-cap',
      version: '1.0.0',
      type: 'capability',
      description: 'A plain capability with no constraints',
      provides: ['testing'],
      budget: { index: 10, summary: 100, standard: 500 },
      behavioral: { core: 'Do stuff.' },
    };

    manager.registerCapability(manifest);
    await manager.mount('plain-cap', 'standard');

    const context = manager.generateContext();
    expect(context).not.toContain('CONSTRAINTS');
  });
});

describe('Constraints — Linter', () => {
  it('warns on short constraints', () => {
    const manifest: CapabilityManifest = {
      name: 'test-lint',
      version: '1.0.0',
      type: 'capability',
      description: 'Test capability for linting constraints',
      provides: ['testing'],
      budget: { index: 10, summary: 100, standard: 500 },
      behavioral: { core: 'Test.' },
      constraints: ['Too short'],
    };

    // Create a temp dir with minimal files for linting
    const result = lintCapability('/nonexistent', manifest);
    const codes = result.warnings.map(w => w.code);
    expect(codes).toContain('CONSTRAINT_TOO_SHORT');
  });

  it('suggests imperative language for weak constraints', () => {
    const manifest: CapabilityManifest = {
      name: 'test-lint-weak',
      version: '1.0.0',
      type: 'capability',
      description: 'Test capability for weak constraint language',
      provides: ['testing'],
      budget: { index: 10, summary: 100, standard: 500 },
      behavioral: { core: 'Test.' },
      constraints: ['Use the nextjs adapter for storybook imports instead of react'],
    };

    const result = lintCapability('/nonexistent', manifest);
    const infoCodes = result.info.map(i => i.code);
    expect(infoCodes).toContain('CONSTRAINT_WEAK_LANGUAGE');
  });

  it('passes clean for well-written constraints', () => {
    const manifest: CapabilityManifest = {
      name: 'test-lint-good',
      version: '1.0.0',
      type: 'capability',
      description: 'Test capability with good constraints',
      provides: ['testing'],
      budget: { index: 10, summary: 100, standard: 500 },
      behavioral: { core: 'Test.' },
      constraints: ['NEVER import from @storybook/react — ALWAYS use @storybook/nextjs'],
    };

    const result = lintCapability('/nonexistent', manifest);
    const constraintWarnings = result.warnings.filter(w => w.code.startsWith('CONSTRAINT'));
    const constraintInfo = result.info.filter(i => i.code.startsWith('CONSTRAINT'));
    expect(constraintWarnings).toHaveLength(0);
    expect(constraintInfo).toHaveLength(0);
  });

  it('warns on file patterns without extensions', () => {
    const manifest: CapabilityManifest = {
      name: 'test-lint-patterns',
      version: '1.0.0',
      type: 'capability',
      description: 'Test capability for file pattern linting',
      provides: ['testing'],
      budget: { index: 10, summary: 100, standard: 500 },
      behavioral: { core: 'Test.' },
      file_patterns: ['stories'],  // no extension or glob
    };

    const result = lintCapability('/nonexistent', manifest);
    const codes = result.warnings.map(w => w.code);
    expect(codes).toContain('FILE_PATTERN_NO_EXTENSION');
  });
});

describe('Constraints — Schema validation', () => {
  it('gc-storybook example validates against schema', () => {
    const loader = new LODLoader();
    const manifest = loader.register(join(EXAMPLES_DIR, 'gc-storybook'));

    expect(manifest.constraints).toHaveLength(2);
    expect(manifest.constraints![0]).toContain('NEVER');
    expect(manifest.file_patterns).toHaveLength(4);
    expect(manifest.file_patterns).toContain('.stories.tsx');
  });
});
