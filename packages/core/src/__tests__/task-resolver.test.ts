import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { TaskResolver } from '../task-resolver.js';
import { LODLoader } from '../loader.js';

const MIGRATION_DIR = join(__dirname, '..', '..', '..', '..', 'migration-output');

describe('TaskResolver — Factory Integration', () => {
  let loader: LODLoader;
  let resolver: TaskResolver;

  beforeEach(() => {
    loader = new LODLoader();
    loader.registerAll([
      join(MIGRATION_DIR, 'nestjs'),
      join(MIGRATION_DIR, 'prisma-gen'),
      join(MIGRATION_DIR, 'supabase'),
      join(MIGRATION_DIR, 'linear'),
      join(MIGRATION_DIR, 'code-review'),
      join(MIGRATION_DIR, 'engram'),
      join(MIGRATION_DIR, 'engram-recall'),
      join(MIGRATION_DIR, 'stripe'),
      join(MIGRATION_DIR, 'salesforce-dev'),
      join(MIGRATION_DIR, 'figma'),
      join(MIGRATION_DIR, 'linkedin'),
      join(MIGRATION_DIR, 'ci-verify'),
      join(MIGRATION_DIR, 'nextjs'),
      join(MIGRATION_DIR, 'supabase-rls-gen'),
      join(MIGRATION_DIR, 'gcalcli'),
    ]);
    resolver = new TaskResolver(loader);
  });

  it('resolves NestJS + Prisma ticket', () => {
    const result = resolver.resolve(
      'Implement a new NestJS service for user authentication. ' +
      'Use Prisma for database access. Add JWT guard and role-based ' +
      'access control. Write unit tests with Jest.'
    );

    const names = result.capabilities.map(c => c.name);
    expect(names).toContain('nestjs');
    expect(names).toContain('prisma-gen');
    expect(result.capabilities.length).toBeGreaterThanOrEqual(2);
    expect(result.capabilities.length).toBeLessThanOrEqual(8);

    // Primary match should be at deep resolution
    const nestjs = result.capabilities.find(c => c.name === 'nestjs');
    expect(nestjs?.resolution).toBe('deep');

    // Context should be generated
    expect(result.context.length).toBeGreaterThan(500);
    expect(result.tokenCost).toBeGreaterThan(0);
  });

  it('resolves code review ticket', () => {
    const result = resolver.resolve(
      'Review the pull request for the auth module. Check for ' +
      'security vulnerabilities, code quality issues, and test coverage. ' +
      'Verify CI passes before approving.'
    );

    const names = result.capabilities.map(c => c.name);
    expect(names).toContain('code-review');
    expect(names).toContain('ci-verify');
  });

  it('resolves Stripe integration ticket', () => {
    const result = resolver.resolve(
      'Add Stripe webhook handler for subscription lifecycle events. ' +
      'Handle checkout.session.completed, invoice.payment_failed, and ' +
      'customer.subscription.deleted events.'
    );

    const names = result.capabilities.map(c => c.name);
    expect(names).toContain('stripe');
  });

  it('resolves Supabase + RLS ticket', () => {
    const result = resolver.resolve(
      'Create Supabase RLS policies for the teams table. Users should ' +
      'only see teams they belong to. Admins can see all teams.'
    );

    const names = result.capabilities.map(c => c.name);
    expect(names).toContain('supabase');
    expect(names).toContain('supabase-rls-gen');
  });

  it('resolves vague ticket via semantic matching', () => {
    const result = resolver.resolve(
      'Fix the bug where users can see other teams data. ' +
      'This is a row level security issue in the supabase database layer.'
    );

    // Should pick up supabase/supabase-rls-gen via keyword/semantic match
    const names = result.capabilities.map(c => c.name);
    expect(result.capabilities.length).toBeGreaterThan(0);
    expect(names).toContain('supabase');
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it('respects budget limits', () => {
    const tightResolver = new TaskResolver(loader, { maxBudget: 2000 });
    const result = tightResolver.resolve(
      'Build a full-stack Next.js app with NestJS backend, ' +
      'Prisma ORM, Supabase hosting, Stripe payments, and ' +
      'Salesforce integration.'
    );

    // Should not exceed budget
    const totalBudget = result.capabilities.reduce((sum, c) => sum + c.tokens, 0);
    expect(totalBudget).toBeLessThanOrEqual(2000);
  });

  it('limits max capabilities', () => {
    const limitedResolver = new TaskResolver(loader, { maxCapabilities: 3 });
    const result = limitedResolver.resolve(
      'Build a full-stack app with NestJS, Prisma, Supabase, ' +
      'Stripe, Linear, GitHub, Figma, and Salesforce integration.'
    );

    expect(result.capabilities.length).toBeLessThanOrEqual(3);
    expect(result.excluded.length).toBeGreaterThan(0);
  });

  it('provides reasoning for selections', () => {
    const result = resolver.resolve('Create a NestJS endpoint for the Linear webhook');

    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.reasoning.some(r => r.includes('nestjs'))).toBe(true);
    expect(result.reasoning.some(r => r.includes('linear'))).toBe(true);
  });

  it('generates injectable context', () => {
    const result = resolver.resolve('Write a NestJS service with Prisma');

    expect(result.context).toContain('## Capability Context');
    expect(result.context).toContain('### nestjs');
    // Context should be a self-contained block ready for injection
    expect(result.context.length).toBeGreaterThan(200);
  });

  it('handles empty/generic tasks gracefully', () => {
    const result = resolver.resolve('Fix the thing');

    // Should still work, just with fewer/no matches
    expect(result.capabilities).toBeDefined();
    expect(result.context).toContain('## Capability Context');
  });
});
