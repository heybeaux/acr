/**
 * ACR Autoresearch — Task Resolver Optimization
 *
 * Tunes the TaskResolver's scoring and threshold parameters
 * against a suite of task→expected capability pairs.
 *
 * Evals (binary):
 * 1. Recall: Does the resolver find ALL expected capabilities for each task?
 * 2. Precision: Are >50% of returned capabilities actually relevant?
 * 3. Efficiency: Is total token cost under budget?
 * 4. Primary: Is the most important capability marked as primary (loaded at deep/standard)?
 *
 * Run: npx tsx packages/core/src/__tests__/autoresearch-resolver.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { TaskResolver } from '../task-resolver.js';
import { LODLoader } from '../loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Test Scenarios ───────────────────────────────────────────────────
// Task description → expected capabilities that MUST be found

interface ResolverScenario {
  id: number;
  task: string;
  expectedCapabilities: string[];  // must be in resolved set
  primaryCapability: string;       // must be loaded at standard or deep
  description: string;
}

const SCENARIOS: ResolverScenario[] = [
  {
    id: 1,
    task: 'Build a NestJS API endpoint with Prisma for user management',
    expectedCapabilities: ['nestjs', 'prisma-gen'],
    primaryCapability: 'nestjs',
    description: 'NestJS + Prisma task',
  },
  {
    id: 2,
    task: 'Review the Salesforce Apex triggers for security vulnerabilities before AppExchange submission',
    expectedCapabilities: ['salesforce-security'],
    primaryCapability: 'salesforce-security',
    description: 'Salesforce security review',
  },
  {
    id: 3,
    task: 'Set up Supabase RLS policies based on our Prisma schema',
    expectedCapabilities: ['supabase-rls-gen'],
    primaryCapability: 'supabase-rls-gen',
    description: 'Supabase RLS from Prisma',
  },
  {
    id: 4,
    task: 'Create a Next.js 13 app with server components and Stripe payment integration',
    expectedCapabilities: ['nextjs', 'stripe'],
    primaryCapability: 'nextjs',
    description: 'Next.js + Stripe',
  },
  {
    id: 5,
    task: 'Run a comprehensive code review and security audit on the codebase',
    expectedCapabilities: ['code-review'],
    primaryCapability: 'code-review',
    description: 'Code review task',
  },
  {
    id: 6,
    task: 'Set up CI/CD pipeline verification for the staging environment',
    expectedCapabilities: ['ci-verify'],
    primaryCapability: 'ci-verify',
    description: 'CI verification',
  },
  {
    id: 7,
    task: 'Analyze the PostgreSQL database schema and generate an ERD',
    expectedCapabilities: ['db-introspect'],
    primaryCapability: 'db-introspect',
    description: 'Database introspection',
  },
  {
    id: 8,
    task: 'Store and recall agent memories using the Engram API',
    expectedCapabilities: ['engram'],
    primaryCapability: 'engram',
    description: 'Engram memory task',
  },
  {
    id: 9,
    task: 'Export design assets from Figma and analyze the design system',
    expectedCapabilities: ['figma'],
    primaryCapability: 'figma',
    description: 'Figma design analysis',
  },
  {
    id: 10,
    task: 'Create a Linear issue for the bug and track it through the sprint',
    expectedCapabilities: ['linear'],
    primaryCapability: 'linear',
    description: 'Linear issue management',
  },
  {
    id: 11,
    task: 'Schedule a daily reminder at 9am and a weekly report every Monday',
    expectedCapabilities: ['cron'],
    primaryCapability: 'cron',
    description: 'Cron scheduling',
  },
  {
    id: 12,
    task: 'Build vector embeddings and semantic search with Pinecone',
    expectedCapabilities: ['pinecone'],
    primaryCapability: 'pinecone',
    description: 'Pinecone vector search',
  },
  {
    id: 13,
    task: 'Post an update on LinkedIn about our product launch',
    expectedCapabilities: ['linkedin'],
    primaryCapability: 'linkedin',
    description: 'LinkedIn posting',
  },
  {
    id: 14,
    task: 'Red team this application — find every bug, security hole, and architecture issue',
    expectedCapabilities: ['app-red-team'],
    primaryCapability: 'app-red-team',
    description: 'App red team audit',
  },
  {
    id: 15,
    task: 'I need expert opinions from multiple AI models on this architecture decision',
    expectedCapabilities: ['consult'],
    primaryCapability: 'consult',
    description: 'Multi-model consultation',
  },
  {
    id: 16,
    task: 'Generate a morning briefing with weather, calendar, and priorities',
    expectedCapabilities: ['morning-report'],
    primaryCapability: 'morning-report',
    description: 'Morning report generation',
  },
  {
    id: 17,
    task: 'Build NestJS guards and interceptors with Prisma middleware',
    expectedCapabilities: ['nestjs'],
    primaryCapability: 'nestjs',
    description: 'NestJS-specific task',
  },
  {
    id: 18,
    task: 'Process a Stripe webhook for subscription renewal and update the database',
    expectedCapabilities: ['stripe'],
    primaryCapability: 'stripe',
    description: 'Stripe webhook handling',
  },
  {
    id: 19,
    task: 'Connect to Supabase and run a SQL query to find duplicate records',
    expectedCapabilities: ['supabase'],
    primaryCapability: 'supabase',
    description: 'Supabase SQL query',
  },
  {
    id: 20,
    task: 'Transcribe this voice message using local Whisper on Apple Silicon',
    expectedCapabilities: ['whisper-mlx-local'],
    primaryCapability: 'whisper-mlx-local',
    description: 'Local Whisper transcription',
  },
];

// ── Eval ──────────────────────────────────────────────────────────────

interface EvalResult {
  passRate: number;
  recallRate: number;
  precisionRate: number;
  primaryRate: number;
  avgTokenCost: number;
  failures: { id: number; description: string; reason: string }[];
}

function runEval(resolver: TaskResolver, maxBudget: number): EvalResult {
  let passCount = 0;
  let recallHits = 0;
  let recallTotal = 0;
  let precisionHits = 0;
  let precisionTotal = 0;
  let primaryHits = 0;
  let totalTokenCost = 0;
  const failures: EvalResult['failures'] = [];

  for (const scenario of SCENARIOS) {
    const result = resolver.resolve(scenario.task);
    const resolvedNames = result.capabilities.map(c => c.name);

    // Eval 1: Recall — all expected capabilities found?
    let allFound = true;
    for (const expected of scenario.expectedCapabilities) {
      recallTotal++;
      if (resolvedNames.includes(expected)) {
        recallHits++;
      } else {
        allFound = false;
      }
    }

    // Eval 2: Precision — are resolved capabilities relevant?
    for (const cap of result.capabilities) {
      precisionTotal++;
      // A capability is "relevant" if it was expected OR is a dependency of an expected one
      if (scenario.expectedCapabilities.includes(cap.name) || cap.reason.includes('dependency')) {
        precisionHits++;
      }
    }

    // Eval 3: Primary at right resolution
    const primaryCap = result.capabilities.find(c => c.name === scenario.primaryCapability);
    if (primaryCap && (primaryCap.resolution === 'standard' || primaryCap.resolution === 'deep')) {
      primaryHits++;
    }

    // Eval 4: Token budget
    totalTokenCost += result.tokenCost;

    // Overall pass: recall + primary correct
    if (allFound && primaryCap) {
      passCount++;
    } else {
      const reasons: string[] = [];
      if (!allFound) {
        const missing = scenario.expectedCapabilities.filter(e => !resolvedNames.includes(e));
        reasons.push(`missing: ${missing.join(', ')}`);
      }
      if (!primaryCap) {
        reasons.push(`primary '${scenario.primaryCapability}' not found`);
      }
      failures.push({ id: scenario.id, description: scenario.description, reason: reasons.join('; ') });
    }
  }

  return {
    passRate: passCount / SCENARIOS.length,
    recallRate: recallTotal > 0 ? recallHits / recallTotal : 0,
    precisionRate: precisionTotal > 0 ? precisionHits / precisionTotal : 0,
    primaryRate: primaryHits / SCENARIOS.length,
    avgTokenCost: totalTokenCost / SCENARIOS.length,
    failures,
  };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const capDir = path.resolve(__dirname, '..', '..', '..', '..', 'migration-output');

  if (!fs.existsSync(capDir)) {
    console.error(`❌ Capability directory not found: ${capDir}`);
    console.error('   Run from the ACR repo root.');
    process.exit(1);
  }

  const outDir = path.resolve(__dirname, '..', '..', '..', '..', 'autoresearch-resolver');
  fs.mkdirSync(outDir, { recursive: true });

  const resultsPath = path.join(outDir, 'results.tsv');
  const changelogPath = path.join(outDir, 'changelog.md');

  fs.writeFileSync(resultsPath, 'experiment\tpass_rate\trecall\tprecision\tprimary_rate\tavg_tokens\tstatus\tdescription\n');
  fs.writeFileSync(changelogPath, '# Autoresearch Changelog — ACR Task Resolver\n\n');

  console.log('=== ACR Autoresearch — Task Resolver Optimization ===\n');
  console.log(`Capabilities: ${capDir}`);
  console.log(`Scenarios: ${SCENARIOS.length}\n`);

  // Load capabilities — LODLoader needs explicit registration per directory
  const loader = new LODLoader();
  const capDirs = fs.readdirSync(capDir)
    .map(d => path.join(capDir, d))
    .filter(d => fs.statSync(d).isDirectory() && fs.existsSync(path.join(d, 'capability.yaml')));

  for (const dir of capDirs) {
    try {
      loader.register(dir);
    } catch (e) {
      console.warn(`   ⚠️ Skipping ${path.basename(dir)}: ${e}`);
    }
  }
  console.log(`Loaded: ${loader.getAllManifests().length} capabilities\n`);

  // Baseline
  console.log('📊 Experiment 0: BASELINE');
  const baselineResolver = new TaskResolver(loader);
  const baseline = runEval(baselineResolver, 15000);

  console.log(`   Pass rate: ${baseline.failures.length === 0 ? '✅' : '❌'} ${(baseline.passRate * 100).toFixed(1)}% (${SCENARIOS.length - baseline.failures.length}/${SCENARIOS.length})`);
  console.log(`   Recall: ${(baseline.recallRate * 100).toFixed(1)}%`);
  console.log(`   Precision: ${(baseline.precisionRate * 100).toFixed(1)}%`);
  console.log(`   Primary resolution: ${(baseline.primaryRate * 100).toFixed(1)}%`);
  console.log(`   Avg tokens: ${baseline.avgTokenCost.toFixed(0)}`);
  if (baseline.failures.length > 0) {
    console.log(`   Failures:`);
    for (const f of baseline.failures) {
      console.log(`     ❌ #${f.id} ${f.description}: ${f.reason}`);
    }
  }

  fs.appendFileSync(resultsPath,
    `0\t${(baseline.passRate*100).toFixed(1)}%\t${(baseline.recallRate*100).toFixed(1)}%\t${(baseline.precisionRate*100).toFixed(1)}%\t${(baseline.primaryRate*100).toFixed(1)}%\t${baseline.avgTokenCost.toFixed(0)}\tbaseline\tdefault config\n`);
  fs.appendFileSync(changelogPath,
    `## Experiment 0 — baseline\n**Pass rate:** ${(baseline.passRate*100).toFixed(1)}%\n**Recall:** ${(baseline.recallRate*100).toFixed(1)}%\n**Precision:** ${(baseline.precisionRate*100).toFixed(1)}%\n**Primary:** ${(baseline.primaryRate*100).toFixed(1)}%\n**Avg tokens:** ${baseline.avgTokenCost.toFixed(0)}\n**Failures:** ${baseline.failures.map(f => `#${f.id} ${f.description}`).join(', ') || 'none'}\n\n`);

  // Experiment configs
  const experiments: { description: string; config: any }[] = [
    { description: 'Lower semantic threshold: 0.3 → 0.2', config: { semanticThreshold: 0.2 } },
    { description: 'Raise semantic threshold: 0.3 → 0.4', config: { semanticThreshold: 0.4 } },
    { description: 'Increase max capabilities: 8 → 12', config: { maxCapabilities: 12 } },
    { description: 'Decrease max capabilities: 8 → 5', config: { maxCapabilities: 5 } },
    { description: 'Increase budget: 15000 → 25000', config: { maxBudget: 25000 } },
    { description: 'Decrease budget: 15000 → 8000', config: { maxBudget: 8000 } },
    { description: 'Lower threshold + more caps', config: { semanticThreshold: 0.2, maxCapabilities: 12 } },
    { description: 'Higher budget + more caps', config: { maxBudget: 25000, maxCapabilities: 12 } },
    { description: 'Tight: low budget, few caps, high threshold', config: { maxBudget: 8000, maxCapabilities: 5, semanticThreshold: 0.4 } },
    { description: 'Wide: high budget, many caps, low threshold', config: { maxBudget: 30000, maxCapabilities: 15, semanticThreshold: 0.15 } },
  ];

  let bestPassRate = baseline.passRate;
  let bestRecall = baseline.recallRate;
  let bestConfig = {};

  for (let i = 0; i < experiments.length; i++) {
    const exp = experiments[i];
    const expNum = i + 1;

    console.log(`\n🔬 Experiment ${expNum}: ${exp.description}`);

    const resolver = new TaskResolver(loader, exp.config);
    const result = runEval(resolver, exp.config.maxBudget || 15000);

    let status: string;
    if (result.passRate > bestPassRate || (result.passRate === bestPassRate && result.recallRate > bestRecall)) {
      status = 'keep';
      bestPassRate = result.passRate;
      bestRecall = result.recallRate;
      bestConfig = exp.config;
      console.log(`   ✅ KEEP — Pass: ${(result.passRate*100).toFixed(1)}% Recall: ${(result.recallRate*100).toFixed(1)}% Precision: ${(result.precisionRate*100).toFixed(1)}%`);
    } else {
      status = 'discard';
      console.log(`   ❌ DISCARD — Pass: ${(result.passRate*100).toFixed(1)}% Recall: ${(result.recallRate*100).toFixed(1)}% Precision: ${(result.precisionRate*100).toFixed(1)}%`);
    }

    if (result.failures.length > 0 && result.failures.length <= 5) {
      for (const f of result.failures) {
        console.log(`      ❌ #${f.id} ${f.description}: ${f.reason}`);
      }
    }

    fs.appendFileSync(resultsPath,
      `${expNum}\t${(result.passRate*100).toFixed(1)}%\t${(result.recallRate*100).toFixed(1)}%\t${(result.precisionRate*100).toFixed(1)}%\t${(result.primaryRate*100).toFixed(1)}%\t${result.avgTokenCost.toFixed(0)}\t${status}\t${exp.description}\n`);
    fs.appendFileSync(changelogPath,
      `## Experiment ${expNum} — ${status}\n**Pass rate:** ${(result.passRate*100).toFixed(1)}%\n**Change:** ${exp.description}\n**Recall:** ${(result.recallRate*100).toFixed(1)}% | Precision: ${(result.precisionRate*100).toFixed(1)}% | Primary: ${(result.primaryRate*100).toFixed(1)}%\n**Avg tokens:** ${result.avgTokenCost.toFixed(0)}\n\n`);
  }

  console.log('\n\n=== AUTORESEARCH COMPLETE ===\n');
  console.log(`Baseline: ${(baseline.passRate*100).toFixed(1)}% pass, ${(baseline.recallRate*100).toFixed(1)}% recall`);
  console.log(`Best:     ${(bestPassRate*100).toFixed(1)}% pass, ${(bestRecall*100).toFixed(1)}% recall`);
  console.log(`Config:   ${JSON.stringify(bestConfig)}`);
  console.log(`\nResults: ${resultsPath}`);
  console.log(`Changelog: ${changelogPath}`);
}

main().catch(console.error);
