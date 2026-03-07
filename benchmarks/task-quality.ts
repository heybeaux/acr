/**
 * ACR Task Quality Benchmark
 *
 * Measures whether ACR's dynamic loading produces equivalent agent task quality
 * compared to flat loading (all capabilities at full resolution).
 *
 * Methodology:
 *   1. Define a set of realistic agent tasks with known correct answers
 *   2. For each task, generate two context variants:
 *      a) FLAT: all 30 capabilities at standard resolution
 *      b) ACR: TaskResolver-selected capabilities at appropriate resolutions
 *   3. Compare: context size, capability coverage, information completeness
 *
 * This benchmark measures CONTEXT QUALITY, not LLM output quality
 * (which would require expensive model calls and subjective evaluation).
 */

import { join, dirname } from 'node:path';
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = typeof import.meta.dirname === 'string' ? import.meta.dirname : dirname(fileURLToPath(import.meta.url));

const { LODLoader, TaskResolver, countTokens } = require(join(__dirname, '..', 'packages', 'core', 'dist', 'index.js'));

const MIGRATION_DIR = join(__dirname, '..', 'migration-output');

// ─── Test Tasks ──────────────────────────────────────────────────

interface BenchmarkTask {
  name: string;
  description: string;
  /** Capabilities that MUST be present for task success */
  requiredCapabilities: string[];
  /** Capabilities that SHOULD NOT be present (noise) */
  irrelevantCapabilities: string[];
}

const TASKS: BenchmarkTask[] = [
  {
    name: 'NestJS Auth Service',
    description: 'Implement a new NestJS service for user authentication. Use Prisma for database access with PostgreSQL. Add JWT guard and role-based access control. Write unit tests.',
    requiredCapabilities: ['nestjs', 'prisma-gen'],
    irrelevantCapabilities: ['figma', 'linkedin', 'linkedin-automator', 'whisper-mlx-local', 'parler-tts-local', 'salesforce-dev', 'salesforce-security'],
  },
  {
    name: 'Supabase RLS Fix',
    description: 'Fix row level security policies on the teams table in Supabase. Users should only see teams they belong to. Admins can see all teams. Test with the Supabase dashboard.',
    requiredCapabilities: ['supabase', 'supabase-rls-gen'],
    irrelevantCapabilities: ['nestjs', 'nextjs', 'figma', 'stripe', 'linkedin'],
  },
  {
    name: 'Stripe Webhook Handler',
    description: 'Add Stripe webhook handler for subscription lifecycle events. Handle checkout.session.completed, invoice.payment_failed, and customer.subscription.deleted.',
    requiredCapabilities: ['stripe'],
    irrelevantCapabilities: ['figma', 'linkedin', 'supabase-rls-gen', 'whisper-mlx-local', 'gcalcli'],
  },
  {
    name: 'Code Review PR',
    description: 'Review the pull request for the authentication module. Check for security vulnerabilities, code quality issues, and test coverage. Verify CI passes.',
    requiredCapabilities: ['code-review'],
    irrelevantCapabilities: ['stripe', 'figma', 'linkedin', 'supabase-gen', 'whisper-mlx-local'],
  },
  {
    name: 'Linear Ticket Triage',
    description: 'Triage the backlog in Linear. Prioritize tickets by severity, assign to team members, update sprint goals for this week.',
    requiredCapabilities: ['linear'],
    irrelevantCapabilities: ['nestjs', 'prisma-gen', 'figma', 'stripe', 'whisper-mlx-local'],
  },
  {
    name: 'Full-Stack Feature',
    description: 'Build a new feature: team invitation system. Next.js frontend with invite form, NestJS API endpoint, Prisma schema for invitations table, Supabase RLS policies, and Stripe billing integration for seat-based pricing.',
    requiredCapabilities: ['nextjs', 'nestjs', 'prisma-gen', 'supabase', 'stripe'],
    irrelevantCapabilities: ['whisper-mlx-local', 'parler-tts-local', 'figma', 'linkedin'],
  },
  {
    name: 'Engram Memory Query',
    description: 'Search Engram for all memories related to the authentication system design decisions. Recall what was decided about JWT vs session-based auth.',
    requiredCapabilities: ['engram-recall'],
    irrelevantCapabilities: ['nestjs', 'stripe', 'figma', 'linkedin', 'salesforce-dev'],
  },
  {
    name: 'Database Schema Analysis',
    description: 'Analyze the current database schema. Find tables without indexes, identify N+1 query risks, check for missing foreign keys, and generate an ERD.',
    requiredCapabilities: ['db-introspect'],
    irrelevantCapabilities: ['stripe', 'figma', 'linkedin', 'whisper-mlx-local', 'gcalcli'],
  },
];

// ─── Benchmark Runner ────────────────────────────────────────────

function run() {
  // Load all capabilities
  const loader = new LODLoader();
  const capDirs: string[] = [];

  for (const name of readdirSync(MIGRATION_DIR)) {
    const dir = join(MIGRATION_DIR, name);
    if (existsSync(join(dir, 'capability.yaml'))) {
      loader.register(dir);
      capDirs.push(dir);
    }
  }

  const resolver = new TaskResolver(loader);
  const allManifests = loader.getAllManifests();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           ACR Task Quality Benchmark                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nCapabilities registered: ${allManifests.length}`);
  console.log(`Tasks: ${TASKS.length}\n`);

  // Calculate flat loading baseline
  let flatTotalTokens = 0;
  for (const m of allManifests) {
    flatTotalTokens += m.budget.standard;
  }

  const results: Array<{
    task: string;
    flatTokens: number;
    acrTokens: number;
    savings: number;
    requiredFound: number;
    requiredTotal: number;
    irrelevantExcluded: number;
    irrelevantTotal: number;
    precision: number;
    recall: number;
  }> = [];

  for (const task of TASKS) {
    const resolution = resolver.resolve(task.description);
    const acrNames = resolution.capabilities.map(c => c.name);

    // Recall: did ACR find all required capabilities?
    const requiredFound = task.requiredCapabilities.filter(r => acrNames.includes(r)).length;
    const recall = requiredFound / task.requiredCapabilities.length;

    // Precision: did ACR exclude irrelevant capabilities?
    const irrelevantIncluded = task.irrelevantCapabilities.filter(r => acrNames.includes(r)).length;
    const irrelevantExcluded = task.irrelevantCapabilities.length - irrelevantIncluded;
    const precision = acrNames.length > 0
      ? (acrNames.length - irrelevantIncluded) / acrNames.length
      : 1;

    const acrTokens = resolution.tokenCost;

    results.push({
      task: task.name,
      flatTokens: flatTotalTokens,
      acrTokens,
      savings: ((1 - acrTokens / flatTotalTokens) * 100),
      requiredFound,
      requiredTotal: task.requiredCapabilities.length,
      irrelevantExcluded,
      irrelevantTotal: task.irrelevantCapabilities.length,
      precision,
      recall,
    });

    const recallEmoji = recall === 1 ? '✅' : recall >= 0.5 ? '⚠️' : '❌';
    const savingsStr = ((1 - acrTokens / flatTotalTokens) * 100).toFixed(0);

    console.log(`─── ${task.name} ───`);
    console.log(`  Flat:     ${flatTotalTokens.toLocaleString()} tokens (all ${allManifests.length} capabilities)`);
    console.log(`  ACR:      ${acrTokens.toLocaleString()} tokens (${resolution.capabilities.length} capabilities)`);
    console.log(`  Savings:  ${savingsStr}%`);
    console.log(`  Recall:   ${recallEmoji} ${requiredFound}/${task.requiredCapabilities.length} required capabilities found`);
    console.log(`  Noise:    ${irrelevantExcluded}/${task.irrelevantCapabilities.length} irrelevant excluded`);
    console.log(`  Selected: ${acrNames.join(', ')}`);
    if (recall < 1) {
      const missing = task.requiredCapabilities.filter(r => !acrNames.includes(r));
      console.log(`  Missing:  ${missing.join(', ')}`);
    }
    console.log('');
  }

  // ─── Summary ───────────────────────────────────────────────

  const avgSavings = results.reduce((s, r) => s + r.savings, 0) / results.length;
  const avgRecall = results.reduce((s, r) => s + r.recall, 0) / results.length;
  const avgPrecision = results.reduce((s, r) => s + r.precision, 0) / results.length;
  const perfectRecall = results.filter(r => r.recall === 1).length;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Tasks:              ${TASKS.length}`);
  console.log(`  Avg token savings:  ${avgSavings.toFixed(1)}%`);
  console.log(`  Avg recall:         ${(avgRecall * 100).toFixed(1)}% (required capabilities found)`);
  console.log(`  Avg precision:      ${(avgPrecision * 100).toFixed(1)}% (irrelevant excluded)`);
  console.log(`  Perfect recall:     ${perfectRecall}/${TASKS.length} tasks`);
  console.log(`  Flat baseline:      ${flatTotalTokens.toLocaleString()} tokens per task`);
  console.log('');

  if (avgRecall >= 0.9) {
    console.log('  ✅ PASS — ACR maintains task quality while reducing tokens');
  } else {
    console.log('  ⚠️  NEEDS WORK — Some required capabilities not being resolved');
  }

  // Output JSON for CI
  const report = {
    timestamp: new Date().toISOString(),
    tasks: TASKS.length,
    capabilities: allManifests.length,
    avgSavings: parseFloat(avgSavings.toFixed(1)),
    avgRecall: parseFloat((avgRecall * 100).toFixed(1)),
    avgPrecision: parseFloat((avgPrecision * 100).toFixed(1)),
    perfectRecall,
    flatBaseline: flatTotalTokens,
    results,
  };

  const reportPath = join(__dirname, 'results.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  Report saved to: benchmarks/results.json`);
}

run();
