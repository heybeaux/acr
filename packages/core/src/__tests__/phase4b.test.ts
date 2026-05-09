import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { FileStateStore } from '../file-state-store.js';
import { Observer, createEvent } from '../observability.js';
import { lintCapability } from '../linter.js';
import type { SerializedState, CapabilityManifest } from '@agentcapabilityruntime/schema';

const TEST_DIR = join(__dirname, '..', '..', '..', '..', '.test-state');
const MIGRATION_DIR = join(__dirname, '..', '..', '..', '..', 'migration-output');

describe('Phase 4b: Production Infrastructure', () => {

  // ─── FileStateStore ──────────────────────────────────────────

  describe('FileStateStore', () => {
    let store: FileStateStore;

    beforeEach(() => {
      rmSync(TEST_DIR, { recursive: true, force: true });
      store = new FileStateStore({ baseDir: TEST_DIR, prettyPrint: true });
    });

    afterEach(() => {
      rmSync(TEST_DIR, { recursive: true, force: true });
    });

    it('saves and loads state', async () => {
      const state: SerializedState = {
        capabilityName: 'linear',
        capabilityVersion: '1.0.0',
        schemaVersion: 1,
        fields: { currentProject: 'ACR', lastTicket: 'ACR-10' },
        serializedAt: Date.now(),
        tokenCount: 15,
      };

      await store.save('session-1', state);
      const loaded = await store.load('session-1', 'linear', '1.0.0');

      expect(loaded).not.toBeNull();
      expect(loaded!.fields.currentProject).toBe('ACR');
      expect(loaded!.fields.lastTicket).toBe('ACR-10');
    });

    it('returns null for missing state', async () => {
      const loaded = await store.load('session-1', 'nonexistent', '1.0.0');
      expect(loaded).toBeNull();
    });

    it('discards on version mismatch', async () => {
      const state: SerializedState = {
        capabilityName: 'linear',
        capabilityVersion: '1.0.0',
        schemaVersion: 1,
        fields: { data: 'old' },
        serializedAt: Date.now(),
        tokenCount: 5,
      };

      await store.save('session-1', state);
      const loaded = await store.load('session-1', 'linear', '2.0.0');
      expect(loaded).toBeNull();

      // Should have been deleted
      const secondLoad = await store.load('session-1', 'linear', '1.0.0');
      expect(secondLoad).toBeNull();
    });

    it('deletes specific capability state', async () => {
      const state: SerializedState = {
        capabilityName: 'engram',
        capabilityVersion: '1.0.0',
        schemaVersion: 1,
        fields: { key: 'value' },
        serializedAt: Date.now(),
        tokenCount: 5,
      };

      await store.save('session-1', state);
      await store.delete('session-1', 'engram');
      const loaded = await store.load('session-1', 'engram', '1.0.0');
      expect(loaded).toBeNull();
    });

    it('deletes entire session', async () => {
      const state1: SerializedState = {
        capabilityName: 'linear',
        capabilityVersion: '1.0.0',
        schemaVersion: 1,
        fields: {},
        serializedAt: Date.now(),
        tokenCount: 0,
      };
      const state2: SerializedState = {
        capabilityName: 'engram',
        capabilityVersion: '1.0.0',
        schemaVersion: 1,
        fields: {},
        serializedAt: Date.now(),
        tokenCount: 0,
      };

      await store.save('session-x', state1);
      await store.save('session-x', state2);
      await store.deleteSession('session-x');

      expect(await store.load('session-x', 'linear', '1.0.0')).toBeNull();
      expect(await store.load('session-x', 'engram', '1.0.0')).toBeNull();
    });

    it('persists to real files', async () => {
      const state: SerializedState = {
        capabilityName: 'nestjs',
        capabilityVersion: '0.1.0',
        schemaVersion: 1,
        fields: { module: 'auth' },
        serializedAt: Date.now(),
        tokenCount: 5,
      };

      await store.save('file-test', state);

      // Verify file exists
      const filePath = join(TEST_DIR, 'file-test', 'nestjs.json');
      expect(existsSync(filePath)).toBe(true);

      // Verify JSON content
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(raw.fields.module).toBe('auth');
    });

    it('lists sessions and capabilities', async () => {
      await store.save('session-a', {
        capabilityName: 'linear',
        capabilityVersion: '1.0.0',
        schemaVersion: 1,
        fields: {},
        serializedAt: Date.now(),
        tokenCount: 0,
      });
      await store.save('session-b', {
        capabilityName: 'engram',
        capabilityVersion: '1.0.0',
        schemaVersion: 1,
        fields: {},
        serializedAt: Date.now(),
        tokenCount: 0,
      });

      const sessions = await store.listSessions();
      expect(sessions).toContain('session-a');
      expect(sessions).toContain('session-b');

      const caps = await store.listCapabilities('session-a');
      expect(caps).toContain('linear');
    });
  });

  // ─── Observer ────────────────────────────────────────────────

  describe('Observer', () => {
    it('tracks mount/unmount metrics', () => {
      const observer = new Observer();

      observer.emit(createEvent('capability:mounted', 'linear', { resolution: 'standard' }));
      observer.emit(createEvent('capability:mounted', 'engram', { resolution: 'deep' }));
      observer.emit(createEvent('capability:unmounted', 'linear', {}));
      observer.emit(createEvent('capability:demoted', 'engram', { from: 'deep', to: 'standard' }));

      const metrics = observer.getMetrics();
      expect(metrics.mounts).toBe(2);
      expect(metrics.unmounts).toBe(1);
      expect(metrics.demotions).toBe(1);
    });

    it('tracks trigger metrics', () => {
      const observer = new Observer();

      observer.emit(createEvent('trigger:matched', 'linear', { pattern: 'ticket' }));
      observer.emit(createEvent('trigger:matched', 'engram', { pattern: 'remember' }));
      observer.emit(createEvent('trigger:suppressed', 'linear', {}));

      const metrics = observer.getMetrics();
      expect(metrics.triggerMatches).toBe(2);
      expect(metrics.triggerSuppressions).toBe(1);
    });

    it('tracks state persistence metrics', () => {
      const observer = new Observer();

      observer.emit(createEvent('state:saved', 'linear', {}));
      observer.emit(createEvent('state:restored', 'engram', {}));
      observer.emit(createEvent('state:lost', 'nestjs', { reason: 'version mismatch' }));

      const metrics = observer.getMetrics();
      expect(metrics.stateSaves).toBe(1);
      expect(metrics.stateRestores).toBe(1);
      expect(metrics.stateLosses).toBe(1);
    });

    it('builds timeline', () => {
      const observer = new Observer();

      observer.emit(createEvent('capability:mounted', 'linear', {}));
      observer.emit(createEvent('trigger:matched', 'engram', {}));
      observer.emit(createEvent('capability:demoted', 'linear', {}));

      const metrics = observer.getMetrics();
      expect(metrics.timeline.length).toBe(3);
      expect(metrics.timeline[0].capability).toBe('linear');
      expect(metrics.timeline[1].capability).toBe('engram');
    });

    it('generates report', () => {
      const observer = new Observer();

      observer.emit(createEvent('capability:mounted', 'linear', {}));
      observer.emit(createEvent('capability:mounted', 'engram', {}));
      observer.emit(createEvent('trigger:matched', 'linear', {}));

      const report = observer.report();
      expect(report).toContain('ACR Session Report');
      expect(report).toContain('Mounts:');
      expect(report).toContain('2');
    });

    it('notifies handlers', () => {
      const events: string[] = [];
      const observer = new Observer({
        onEvent: (e) => events.push(e.type),
      });

      observer.emit(createEvent('capability:mounted', 'test', {}));
      expect(events).toEqual(['capability:mounted']);
    });

    it('supports unsubscribe', () => {
      const events: string[] = [];
      const observer = new Observer();

      const unsub = observer.on((e) => events.push(e.type));
      observer.emit(createEvent('capability:mounted', 'test', {}));
      expect(events.length).toBe(1);

      unsub();
      observer.emit(createEvent('capability:unmounted', 'test', {}));
      expect(events.length).toBe(1); // no new event
    });

    it('filters events by type', () => {
      const observer = new Observer();

      observer.emit(createEvent('capability:mounted', 'a', {}));
      observer.emit(createEvent('trigger:matched', 'b', {}));
      observer.emit(createEvent('capability:mounted', 'c', {}));

      const mounts = observer.getEventsByType('capability:mounted');
      expect(mounts.length).toBe(2);
    });
  });

  // ─── Linter ──────────────────────────────────────────────────

  describe('Linter', () => {
    it('lints a clean capability without issues', () => {
      const nestjsDir = join(MIGRATION_DIR, 'nestjs');
      if (!existsSync(nestjsDir)) return; // skip if not migrated

      const yaml = require('yaml');
      const manifest = yaml.parse(readFileSync(join(nestjsDir, 'capability.yaml'), 'utf-8'));
      const result = lintCapability(nestjsDir, manifest);

      expect(result.errors.length).toBe(0);
    });

    it('detects missing files', () => {
      const manifest: CapabilityManifest = {
        name: 'test-lint',
        type: 'capability',
        version: '0.1.0',
        description: 'A test capability for linting',
        provides: ['test'],
        requires: { tools: [], capabilities: [], context: [] },
        budget: { index: 10, summary: 50, standard: 200 },
      } as any;

      const result = lintCapability('/nonexistent/path', manifest);
      expect(result.errors.some(e => e.code === 'MISSING_INDEX')).toBe(true);
      expect(result.errors.some(e => e.code === 'MISSING_STANDARD')).toBe(true);
    });
  });
});
