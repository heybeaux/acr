import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../context-manager.js';
import type { CapabilityManifest, ACREvent } from '@acr/schema';

function makeManifest(overrides: Partial<CapabilityManifest> & { name: string }): CapabilityManifest {
  return {
    version: '1.0.0',
    type: 'capability',
    description: `${overrides.name} capability`,
    provides: [overrides.name],
    budget: { index: 10, summary: 100, standard: 500, deep: 1500 },
    behavioral: { core: `Do ${overrides.name} stuff.` },
    ...overrides,
  };
}

describe('ContextManager', () => {
  let cm: ContextManager;

  beforeEach(() => {
    cm = new ContextManager({
      windowSize: 128000,
      residentBudget: 2000,
      defaultPermissionPolicy: 'allow-with-log',
      sessionId: 'test-session',
    });
  });

  describe('registration', () => {
    it('registers capabilities in COLD zone at index resolution', () => {
      const m = makeManifest({ name: 'test-cap' });
      cm.registerCapability(m);

      const status = cm.status('test-cap');
      expect(status).not.toBeNull();
      expect(status!.zone).toBe('COLD');
      expect(status!.resolution).toBe('index');
      expect(status!.budgetUsed).toBe(10);
    });

    it('registers multiple capabilities', () => {
      cm.registerAll([
        makeManifest({ name: 'alpha' }),
        makeManifest({ name: 'beta' }),
        makeManifest({ name: 'gamma' }),
      ]);

      const reg = cm.registry();
      expect(reg).toHaveLength(3);
      expect(reg.map(r => r.name).sort()).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  describe('mount', () => {
    it('mounts capability to HOT zone at standard resolution', async () => {
      cm.registerCapability(makeManifest({ name: 'test-cap' }));
      const result = await cm.mount('test-cap');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.resolution).toBe('standard');
        expect(result.zone).toBe('HOT');
        expect(result.budgetUsed).toBe(500);
      }
    });

    it('mounts at requested resolution', async () => {
      cm.registerCapability(makeManifest({ name: 'test-cap' }));
      const result = await cm.mount('test-cap', 'deep');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.resolution).toBe('deep');
        expect(result.budgetUsed).toBe(1500);
      }
    });

    it('returns error for unknown capability', async () => {
      const result = await cm.mount('nonexistent');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('MOUNT_FAILED');
      }
    });

    it('demotes LRU capabilities when budget is tight', async () => {
      const cm2 = new ContextManager({
        windowSize: 1200,
        residentBudget: 100,
        defaultPermissionPolicy: 'allow-with-log',
        sessionId: 'test',
      });

      cm2.registerAll([
        makeManifest({ name: 'first', budget: { index: 10, summary: 50, standard: 400 } }),
        makeManifest({ name: 'second', budget: { index: 10, summary: 50, standard: 400 } }),
        makeManifest({ name: 'third', budget: { index: 10, summary: 50, standard: 500 } }),
      ]);

      await cm2.mount('first');
      await cm2.mount('second');
      // Budget used: 100 resident + 10*3 index + 400 + 400 = 930 + 10 = 940
      // Available: 1200 - 940 = 260, but third needs 500-10=490 more

      const result = await cm2.mount('third');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.demotions.length).toBeGreaterThan(0);
        expect(result.demotions[0].capability).toBe('first'); // LRU
      }
    });
  });

  describe('unmount', () => {
    it('demotes to COLD zone at index', async () => {
      cm.registerCapability(makeManifest({ name: 'test-cap' }));
      await cm.mount('test-cap');
      const result = await cm.unmount('test-cap');

      expect(result.previousResolution).toBe('standard');
      expect(result.triggersSuppressed).toBe(true);

      const status = cm.status('test-cap');
      expect(status!.zone).toBe('COLD');
      expect(status!.resolution).toBe('index');
    });

    it('suppresses triggers after unmount', async () => {
      const m = makeManifest({
        name: 'trigger-cap',
        activation: {
          triggers: [{ type: 'pattern', match: 'activate me' }],
        },
      });

      cm.registerCapability(m);
      await cm.mount('trigger-cap');
      await cm.unmount('trigger-cap');

      // Trigger should be suppressed
      const matches = await cm.processMessage('please activate me now');
      const mounted = cm.mounted();
      expect(mounted.find(m => m.manifest.name === 'trigger-cap')).toBeUndefined();
    });
  });

  describe('triggers', () => {
    it('auto-mounts on pattern match', async () => {
      const m = makeManifest({
        name: 'pr-review',
        activation: {
          triggers: [{ type: 'pattern', match: 'review (this )?PR' }],
        },
      });

      cm.registerCapability(m);
      const matches = await cm.processMessage('Can you review this PR?');

      expect(matches).toHaveLength(1);
      expect(matches[0].capabilityName).toBe('pr-review');

      const status = cm.status('pr-review');
      expect(status!.zone).toBe('HOT');
    });

    it('does not trigger for already-mounted capabilities', async () => {
      const m = makeManifest({
        name: 'pr-review',
        activation: {
          triggers: [{ type: 'pattern', match: 'review PR' }],
        },
      });

      cm.registerCapability(m);
      await cm.mount('pr-review');

      const matches = await cm.processMessage('review PR again');
      expect(matches).toHaveLength(0);
    });

    it('handles runtime event triggers', async () => {
      const m = makeManifest({
        name: 'github-ops',
        activation: {
          triggers: [{ type: 'runtime_event', condition: 'tool_available("github")' }],
        },
      });

      cm.registerCapability(m);

      // No github tool
      let matches = await cm.processStateChange({
        availableTools: ['slack'],
        customState: {},
      });
      expect(matches).toHaveLength(0);

      // Github becomes available
      matches = await cm.processStateChange({
        availableTools: ['github', 'slack'],
        customState: {},
      });
      expect(matches).toHaveLength(1);
      expect(matches[0].capabilityName).toBe('github-ops');
    });
  });

  describe('permissions', () => {
    it('allows explicitly permitted actions', () => {
      const m = makeManifest({
        name: 'review',
        permissions: {
          tools: {
            github: {
              get_pull_request: 'allow',
              merge_pull_request: 'deny',
            },
          },
        },
      });

      cm.registerCapability(m);

      const allowed = cm.checkPermission('github', 'get_pull_request', 'review');
      expect(allowed.allowed).toBe(true);

      const denied = cm.checkPermission('github', 'merge_pull_request', 'review');
      expect(denied.allowed).toBe(false);
    });

    it('applies default policy for unspecified tools', () => {
      cm.registerCapability(makeManifest({ name: 'basic' }));

      const decision = cm.checkPermission('anything', 'anything', 'basic');
      expect(decision.allowed).toBe(true); // allow-with-log
      expect(decision.logged).toBe(true);
    });

    it('deny policy blocks unspecified tools', () => {
      const cm2 = new ContextManager({
        windowSize: 128000,
        residentBudget: 2000,
        defaultPermissionPolicy: 'deny',
        sessionId: 'test',
      });

      cm2.registerCapability(makeManifest({ name: 'locked' }));

      const decision = cm2.checkPermission('anything', 'anything', 'locked');
      expect(decision.allowed).toBe(false);
    });
  });

  describe('state persistence', () => {
    it('serializes and restores state across mount/unmount', async () => {
      const m = makeManifest({
        name: 'stateful',
        state_schema: {
          version: 1,
          max_size_tokens: 200,
          fields: [
            { name: 'target_pr', type: 'string' },
            { name: 'progress', type: 'number' },
          ],
        },
      });

      cm.registerCapability(m);
      await cm.mount('stateful');

      // Update state
      cm.updateState('stateful', { target_pr: 'heybeaux/acr#42', progress: 3 });

      // Unmount (serializes)
      await cm.unmount('stateful');

      // Remount (restores)
      const result = await cm.mount('stateful');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.restoredState).toBe(true);
      }
    });
  });

  describe('snapshot', () => {
    it('returns complete context state', async () => {
      cm.registerAll([
        makeManifest({ name: 'alpha' }),
        makeManifest({ name: 'beta' }),
        makeManifest({ name: 'gamma' }),
      ]);

      await cm.mount('alpha');
      await cm.mount('beta', 'summary');

      const snap = cm.snapshot();
      expect(snap.sessionId).toBe('test-session');
      expect(snap.hotCount).toBe(1);
      expect(snap.warmCount).toBe(1);
      expect(snap.coldCount).toBe(1);
      expect(snap.capabilities).toHaveLength(3);
    });
  });

  describe('events', () => {
    it('emits events for mount/unmount lifecycle', async () => {
      const events: ACREvent[] = [];
      cm.on(e => events.push(e));

      cm.registerCapability(makeManifest({ name: 'evented' }));
      await cm.mount('evented');
      await cm.unmount('evented');

      const types = events.map(e => e.type);
      expect(types).toContain('capability:mounted');
      expect(types).toContain('capability:unmounted');
    });
  });

  describe('co-activation', () => {
    it('auto-mounts co-activated capabilities', async () => {
      cm.registerAll([
        makeManifest({
          name: 'primary',
          activation: { co_activates: ['helper'] },
        }),
        makeManifest({ name: 'helper' }),
      ]);

      await cm.mount('primary');

      const helperStatus = cm.status('helper');
      expect(helperStatus!.zone).toBe('WARM'); // co-activated at summary
    });
  });

  describe('context generation', () => {
    it('generates structured context prompt', async () => {
      cm.registerAll([
        makeManifest({ name: 'alpha', behavioral: { core: 'Alpha instructions.' } }),
        makeManifest({ name: 'beta', behavioral: { core: 'Beta instructions.' } }),
      ]);

      await cm.mount('alpha');

      const context = cm.generateContext();
      expect(context).toContain('Available Capabilities');
      expect(context).toContain('alpha');
      expect(context).toContain('Alpha instructions.');
      expect(context).not.toContain('Beta instructions.'); // beta still at index
    });
  });
});
