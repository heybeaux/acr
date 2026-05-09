import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerEngine } from '../trigger-engine.js';
import type { CapabilityManifest } from '@agentcapabilityruntime/schema';

function makeManifest(name: string, triggers: any[]): CapabilityManifest {
  return {
    name,
    version: '1.0.0',
    type: 'capability',
    description: `${name} capability`,
    provides: [name],
    budget: { index: 10, summary: 100, standard: 500 },
    behavioral: { core: '' },
    activation: { triggers, trigger_logic: 'OR' },
  };
}

describe('TriggerEngine', () => {
  let engine: TriggerEngine;

  beforeEach(() => {
    engine = new TriggerEngine();
  });

  describe('pattern triggers', () => {
    it('matches regex patterns case-insensitively', () => {
      engine.register(makeManifest('pr-review', [
        { type: 'pattern', match: 'review (this )?PR' },
      ]));

      const matches = engine.evaluatePatterns('Can you Review This PR?');
      expect(matches).toHaveLength(1);
      expect(matches[0].capabilityName).toBe('pr-review');
    });

    it('returns no matches when pattern does not match', () => {
      engine.register(makeManifest('pr-review', [
        { type: 'pattern', match: 'review PR' },
      ]));

      const matches = engine.evaluatePatterns('Hello world');
      expect(matches).toHaveLength(0);
    });

    it('skips capabilities in skip set', () => {
      engine.register(makeManifest('pr-review', [
        { type: 'pattern', match: 'review PR' },
      ]));

      const matches = engine.evaluatePatterns('review PR', new Set(['pr-review']));
      expect(matches).toHaveLength(0);
    });

    it('handles OR logic — first match short-circuits', () => {
      engine.register(makeManifest('multi', [
        { type: 'pattern', match: 'alpha' },
        { type: 'pattern', match: 'beta' },
      ]));

      const matches = engine.evaluatePatterns('alpha beta');
      expect(matches).toHaveLength(1); // one match per capability
    });

    it('handles AND logic — requires all triggers', () => {
      const manifest = makeManifest('strict', [
        { type: 'pattern', match: 'deploy' },
        { type: 'pattern', match: 'production' },
      ]);
      manifest.activation!.trigger_logic = 'AND';
      engine.register(manifest);

      expect(engine.evaluatePatterns('deploy to staging')).toHaveLength(0);
      expect(engine.evaluatePatterns('deploy to production')).toHaveLength(1);
    });

    it('matches across multiple capabilities', () => {
      engine.register(makeManifest('cap-a', [{ type: 'pattern', match: 'hello' }]));
      engine.register(makeManifest('cap-b', [{ type: 'pattern', match: 'world' }]));

      const matches = engine.evaluatePatterns('hello world');
      expect(matches).toHaveLength(2);
    });
  });

  describe('runtime event triggers', () => {
    it('evaluates tool_available condition', () => {
      engine.register(makeManifest('github-ops', [
        { type: 'runtime_event', condition: 'tool_available("github")' },
      ]));

      const noMatch = engine.evaluateRuntimeEvents({
        availableTools: ['slack'],
        customState: {},
      });
      expect(noMatch).toHaveLength(0);

      const match = engine.evaluateRuntimeEvents({
        availableTools: ['github'],
        customState: {},
      });
      expect(match).toHaveLength(1);
    });

    it('evaluates session_type condition', () => {
      engine.register(makeManifest('admin-tools', [
        { type: 'runtime_event', condition: 'session_type("admin")' },
      ]));

      const match = engine.evaluateRuntimeEvents({
        availableTools: [],
        sessionType: 'admin',
        customState: {},
      });
      expect(match).toHaveLength(1);
    });
  });

  describe('semantic triggers', () => {
    it('matches semantically similar messages', () => {
      // Register a capability about issue tracking and project management
      const manifest: any = {
        name: 'issue-tracker',
        version: '1.0.0',
        type: 'capability',
        description: 'Track issues, bugs, tickets, and project tasks in Linear',
        provides: ['issue-tracking', 'project-management', 'tickets', 'bugs', 'sprint'],
        budget: { index: 10, summary: 100, standard: 500 },
        behavioral: { core: '' },
        // No explicit pattern triggers — relies on semantic matching
      };

      engine.register(manifest);

      // Should match on semantically related messages
      const matches = engine.evaluatePatterns('check my sprint tickets');
      const semanticMatches = matches.filter(m => m.triggerType === 'semantic');
      expect(semanticMatches.length).toBeGreaterThan(0);
      expect(semanticMatches[0].capabilityName).toBe('issue-tracker');
    });

    it('does not match unrelated messages', () => {
      const manifest: any = {
        name: 'weather-check',
        version: '1.0.0',
        type: 'capability',
        description: 'Check weather forecasts and temperature for any location',
        provides: ['weather', 'forecast', 'temperature'],
        budget: { index: 10, summary: 100, standard: 500 },
        behavioral: { core: '' },
      };

      engine.register(manifest);

      const matches = engine.evaluatePatterns('review the database schema migration');
      const weatherMatches = matches.filter(m => m.capabilityName === 'weather-check');
      expect(weatherMatches).toHaveLength(0);
    });

    it('regex takes priority over semantic', () => {
      const manifest = makeManifest('pr-review', [
        { type: 'pattern', match: 'review PR' },
      ]);
      (manifest as any).description = 'Review pull requests for code quality';
      (manifest as any).provides = ['code-review', 'pr-review'];

      engine.register(manifest);

      const matches = engine.evaluatePatterns('review PR #42');
      // Should match via regex, not semantic
      expect(matches).toHaveLength(1);
      expect(matches[0].triggerType).toBe('pattern');
    });
  });

  describe('lifecycle', () => {
    it('unregisters capabilities', () => {
      engine.register(makeManifest('temp', [{ type: 'pattern', match: 'temp' }]));
      expect(engine.size).toBe(1);

      engine.unregister('temp');
      expect(engine.size).toBe(0);

      const matches = engine.evaluatePatterns('temp');
      expect(matches).toHaveLength(0);
    });
  });
});
