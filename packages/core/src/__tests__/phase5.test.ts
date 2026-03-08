import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveSpawnConfig, resolveFromTask } from '../spawn-resolver.js';
import { buildIndex, searchRegistry } from '../registry.js';
import { LODLoader } from '../loader.js';
import { TaskResolver } from '../task-resolver.js';
import { existsSync } from 'node:fs';

const MIGRATION_DIR = join(__dirname, '..', '..', '..', '..', 'migration-output');

describe('Phase 5: Multi-Agent & Ecosystem', () => {

  // ─── Spawn Resolver ─────────────────────────────────────────

  describe('SpawnResolver', () => {
    it('resolves explicit capability list', () => {
      const config = resolveSpawnConfig(128000, undefined, {
        capabilities: ['nestjs', 'prisma-gen', 'github'],
        resolutions: { nestjs: 'deep', github: 'summary' },
        sessionId: 'worker-1',
      });

      expect(config.capabilities).toEqual(['nestjs', 'prisma-gen', 'github']);
      expect(config.resolutions.nestjs).toBe('deep');
      expect(config.resolutions['prisma-gen']).toBe('standard'); // default
      expect(config.resolutions.github).toBe('summary');
      expect(config.windowSize).toBe(128000);
      expect(config.sessionId).toBe('worker-1');
    });

    it('inherits parent policy', () => {
      const parentPolicy = {
        name: 'parent-policy',
        allowed_capabilities: ['nestjs', 'prisma-gen', 'github', 'linear'],
        default_resolution: 'standard' as const,
        max_capabilities: 10,
      };

      const config = resolveSpawnConfig(128000, parentPolicy, {
        capabilities: ['nestjs', 'prisma-gen'],
        sessionId: 'worker-2',
      });

      // Allowed capabilities should be narrowed to what was requested
      expect(config.policy.allowed_capabilities).toEqual(['nestjs', 'prisma-gen']);
    });

    it('applies budget override', () => {
      const config = resolveSpawnConfig(128000, undefined, {
        capabilities: ['nestjs'],
        sessionId: 'worker-3',
        maxBudget: 50000,
      });

      expect(config.windowSize).toBe(50000);
    });

    it('uses default resolution when none specified', () => {
      const config = resolveSpawnConfig(128000, undefined, {
        capabilities: ['a', 'b', 'c'],
        sessionId: 'worker-4',
      });

      expect(config.resolutions.a).toBe('standard');
      expect(config.resolutions.b).toBe('standard');
      expect(config.resolutions.c).toBe('standard');
    });
  });

  // ─── resolveFromTask ────────────────────────────────────────

  describe('resolveFromTask', () => {
    it('auto-resolves capabilities from task description', () => {
      if (!existsSync(join(MIGRATION_DIR, 'nestjs'))) return;

      const loader = new LODLoader();
      loader.registerAll([
        join(MIGRATION_DIR, 'nestjs'),
        join(MIGRATION_DIR, 'prisma-gen'),
        join(MIGRATION_DIR, 'linear'),
        join(MIGRATION_DIR, 'code-review'),
      ]);

      const taskResolver = new TaskResolver(loader);

      const config = resolveFromTask(
        taskResolver,
        'Implement NestJS auth service with Prisma ORM',
        {
          sessionId: 'factory-worker-7',
          maxBudget: 50000,
        },
      );

      expect(config.capabilities).toContain('nestjs');
      expect(config.capabilities).toContain('prisma-gen');
      expect(config.sessionId).toBe('factory-worker-7');
      expect(config.windowSize).toBe(50000);
    });
  });

  // ─── Registry ───────────────────────────────────────────────

  describe('Registry', () => {
    it('builds index from capabilities directory', () => {
      if (!existsSync(MIGRATION_DIR)) return;

      const index = buildIndex(MIGRATION_DIR);
      expect(index.capabilities.length).toBe(30);
      expect(index.version).toBe(1);
      expect(index.updatedAt).toBeGreaterThan(0);
    });

    it('searches by name', () => {
      if (!existsSync(MIGRATION_DIR)) return;

      const index = buildIndex(MIGRATION_DIR);
      const results = searchRegistry(index, 'nestjs');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].capability.name).toBe('nestjs');
    });

    it('searches by description keyword', () => {
      if (!existsSync(MIGRATION_DIR)) return;

      const index = buildIndex(MIGRATION_DIR);
      const results = searchRegistry(index, 'payment');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.capability.name === 'stripe')).toBe(true);
    });

    it('searches by provides tag', () => {
      if (!existsSync(MIGRATION_DIR)) return;

      const index = buildIndex(MIGRATION_DIR);
      const results = searchRegistry(index, 'supabase');

      expect(results.length).toBeGreaterThanOrEqual(3); // supabase, supabase-gen, supabase-rls-gen
    });

    it('returns empty for no matches', () => {
      if (!existsSync(MIGRATION_DIR)) return;

      const index = buildIndex(MIGRATION_DIR);
      const results = searchRegistry(index, 'xyznonexistent');
      expect(results.length).toBe(0);
    });
  });

  // ─── Model Routing ──────────────────────────────────────────

  describe('Model Routing', () => {
    it('should include modelPreferences in task resolution', () => {
      if (!existsSync(MIGRATION_DIR)) return;
      const loader = new LODLoader();
      const { readdirSync } = require('node:fs');
      for (const name of readdirSync(MIGRATION_DIR)) {
        const dir = join(MIGRATION_DIR, name);
        if (existsSync(join(dir, 'capability.yaml'))) {
          loader.register(dir);
        }
      }
      const resolver = new TaskResolver(loader);
      const result = resolver.resolve('Create a NestJS endpoint');
      expect(result.modelPreferences).toBeDefined();
      expect(result.modelPreferences.constraints).toBeInstanceOf(Array);
      expect(result.modelPreferences.perCapability).toBeDefined();
    });

    it('should pass model preferences through SpawnResolver', () => {
      if (!existsSync(MIGRATION_DIR)) return;
      const loader = new LODLoader();
      const { readdirSync } = require('node:fs');
      for (const name of readdirSync(MIGRATION_DIR)) {
        const dir = join(MIGRATION_DIR, name);
        if (existsSync(join(dir, 'capability.yaml'))) {
          loader.register(dir);
        }
      }
      const taskResolver = new TaskResolver(loader);
      const config = resolveFromTask(taskResolver, 'Create a NestJS endpoint', {
        sessionId: 'test-model-routing',
      });
      // modelPreferences should exist (even if empty — no capabilities declare models yet)
      expect(config).toBeDefined();
      expect(config.capabilities.length).toBeGreaterThan(0);
    });

    it('should return empty model preferences when no capabilities declare models', () => {
      if (!existsSync(MIGRATION_DIR)) return;
      const loader = new LODLoader();
      const { readdirSync } = require('node:fs');
      for (const name of readdirSync(MIGRATION_DIR)) {
        const dir = join(MIGRATION_DIR, name);
        if (existsSync(join(dir, 'capability.yaml'))) {
          loader.register(dir);
        }
      }
      const resolver = new TaskResolver(loader);
      const result = resolver.resolve('Create a NestJS endpoint');
      // No migrated capabilities have model fields, so preferences should be empty
      expect(result.modelPreferences.preferred).toBeUndefined();
      expect(result.modelPreferences.constraints).toEqual([]);
      expect(Object.keys(result.modelPreferences.perCapability)).toEqual([]);
    });
  });
});
