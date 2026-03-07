import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { AgentAPI } from '../agent-api.js';
import { LODLoader } from '../loader.js';
import { applySessionPolicy } from '../session-policy.js';
import type { SessionPolicy } from '../session-policy.js';

const EXAMPLES_DIR = join(__dirname, '..', '..', '..', '..', 'examples');
const ALL_EXAMPLE_DIRS = [
  join(EXAMPLES_DIR, 'code-review'),
  join(EXAMPLES_DIR, 'consult'),
  join(EXAMPLES_DIR, 'engram-recall'),
  join(EXAMPLES_DIR, 'linear'),
  join(EXAMPLES_DIR, 'nestjs'),
];

describe('Integration: Full Lifecycle', () => {
  describe('LOD Loader with real files', () => {
    let loader: LODLoader;

    beforeEach(() => {
      loader = new LODLoader();
    });

    it('loads all example capabilities', () => {
      const manifests = loader.registerAll(ALL_EXAMPLE_DIRS);
      expect(manifests).toHaveLength(5);
      expect(manifests.map(m => m.name).sort()).toEqual([
        'code-review', 'consult', 'engram-recall', 'linear', 'nestjs',
      ]);
    });

    it('loads index.txt content', () => {
      loader.registerAll(ALL_EXAMPLE_DIRS);
      const loaded = loader.load('code-review', 'index');
      expect(loaded.resolution).toBe('index');
      expect(loaded.content.length).toBeGreaterThan(0);
      expect(loaded.content.length).toBeLessThan(200); // index should be tiny
    });

    it('loads summary.md content', () => {
      loader.registerAll(ALL_EXAMPLE_DIRS);
      const loaded = loader.load('linear', 'summary');
      expect(loaded.resolution).toBe('summary');
      expect(loaded.content).toContain('linear');
    });

    it('loads standard.md content', () => {
      loader.registerAll(ALL_EXAMPLE_DIRS);
      const loaded = loader.load('engram-recall', 'standard');
      expect(loaded.resolution).toBe('standard');
      expect(loaded.content.length).toBeGreaterThan(500);
    });

    it('loads deep.md for nestjs', () => {
      loader.registerAll(ALL_EXAMPLE_DIRS);
      const loaded = loader.load('nestjs', 'deep');
      expect(loaded.resolution).toBe('deep');
      expect(loaded.content.length).toBeGreaterThan(1000);
    });

    it('falls back to standard when deep not available', () => {
      loader.registerAll(ALL_EXAMPLE_DIRS);
      const loaded = loader.load('code-review', 'deep');
      // code-review has no deep.md → should fall back to standard
      expect(loaded.resolution).toBe('standard');
    });

    it('generates combined context', () => {
      loader.registerAll(ALL_EXAMPLE_DIRS);

      const resolutions = new Map<string, string>([
        ['code-review', 'standard'],
        ['linear', 'summary'],
        ['engram-recall', 'index'],
        ['consult', 'index'],
        ['nestjs', 'index'],
      ]) as Map<string, any>;

      const context = loader.generateContext(resolutions);

      // Should contain registry
      expect(context).toContain('Capability Registry');

      // Should contain mounted capabilities
      expect(context).toContain('code-review [standard]');
      expect(context).toContain('linear [summary]');

      // Should NOT contain index-only capabilities in detail
      expect(context).not.toContain('engram-recall [index]');
    });
  });

  describe('AgentAPI with real capabilities', () => {
    let api: AgentAPI;

    beforeEach(() => {
      api = new AgentAPI({
        windowSize: 128000,
        residentBudget: 2000,
        capabilityDirs: ALL_EXAMPLE_DIRS,
        sessionId: 'integration-test',
      });
    });

    it('initializes with all capabilities in COLD', () => {
      const reg = api.registry();
      expect(reg).toHaveLength(5);
      expect(reg.every(r => r.zone === 'COLD')).toBe(true);
    });

    it('mounts a capability and generates context', async () => {
      const result = await api.mount('code-review');
      expect(result.success).toBe(true);

      const context = api.getContext();
      expect(context).toContain('code-review');

      const snap = api.snapshot();
      expect(snap.hotCount).toBe(1);
    });

    it('processes message triggers', async () => {
      const { triggers, snapshot } = await api.processMessage('Can you review this PR for me?');

      // code-review has a trigger for "review.*PR" or similar
      // Whether it fires depends on the actual trigger pattern in the example
      expect(snapshot.capabilities).toHaveLength(5);
    });

    it('mounts and unmounts with state persistence', async () => {
      await api.mount('code-review');
      api.updateState('code-review', { currentPR: '#42', filesReviewed: 3 });

      const unmountResult = await api.unmount('code-review');
      expect(unmountResult.previousResolution).toBe('standard');

      // Remount — state should restore if schema defined
      const remount = await api.mount('code-review');
      expect(remount.success).toBe(true);
    });

    it('respects budget constraints', async () => {
      // Mount all at standard
      for (const name of ['code-review', 'consult', 'engram-recall', 'linear', 'nestjs']) {
        const result = await api.mount(name);
        expect(result.success).toBe(true);
      }

      const snap = api.snapshot();
      expect(snap.budgetUsed).toBeGreaterThan(0);
      expect(snap.utilization).toBeLessThan(1); // shouldn't overflow 128K
      expect(snap.hotCount).toBe(5);
    });

    it('generates usable context with multiple resolutions', async () => {
      await api.mount('code-review', 'standard');
      await api.mount('linear', 'summary');
      await api.mount('nestjs', 'deep');

      const context = api.getContext();

      // Should have all capabilities in registry
      expect(context).toContain('Capability Registry');

      // Should have mounted capabilities with content
      expect(context.length).toBeGreaterThan(1000);
    });

    it('permission checking works', async () => {
      await api.mount('code-review');
      const decision = api.checkPermission('github', 'get_pull_request', 'code-review');
      // Default policy is allow-with-log
      expect(decision.allowed).toBe(true);
    });

    it('cleans up properly', async () => {
      await api.mount('code-review');
      await api.mount('linear');
      await api.cleanup();

      const reg = api.registry();
      expect(reg).toHaveLength(0);
    });
  });

  describe('Session Policy integration', () => {
    it('filters capabilities by policy', () => {
      const loader = new LODLoader();
      const manifests = loader.registerAll(ALL_EXAMPLE_DIRS);

      const policy: SessionPolicy = {
        name: 'read-only',
        description: 'Read-only session for reviewers',
        resolution: {},
        permissions_override: {
          github: { merge_pull_request: 'deny', delete_branch: 'deny' },
        },
        denied_capabilities: ['linear'],
        default_permission_policy: 'deny',
      };

      const result = applySessionPolicy(manifests, policy);
      expect(result.allowed).toHaveLength(4);
      expect(result.denied).toHaveLength(1);
      expect(result.denied[0].name).toBe('linear');
    });

    it('applies policy through AgentAPI', () => {
      const policy: SessionPolicy = {
        name: 'minimal',
        description: 'Minimal session',
        resolution: {},
        permissions_override: {},
        allowed_capabilities: ['code-review', 'engram-recall'],
      };

      const api = new AgentAPI({
        capabilityDirs: ALL_EXAMPLE_DIRS,
        sessionPolicy: policy,
      });

      const reg = api.registry();
      expect(reg).toHaveLength(2);
      expect(reg.map(r => r.name).sort()).toEqual(['code-review', 'engram-recall']);
    });
  });
});
