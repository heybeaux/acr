#!/usr/bin/env node

import { resolve as resolvePath, join } from 'node:path';
import { existsSync, readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { validateCapability } from '@acr/core';
import { resolve as resolveCapabilities } from '@acr/core';
import { calculateBudget } from '@acr/core';
import { migrateSkill } from '@acr/core';
import { detectLegacy, scanCapabilities } from '@acr/core';
import { lintCapability, formatLintResults } from '@acr/core';
import { parse as parseYaml } from 'yaml';
import type { CapabilityManifest } from '@acr/schema';

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'validate':
    cmdValidate(args.slice(1));
    break;
  case 'migrate':
    cmdMigrate(args.slice(1));
    break;
  case 'budget':
    cmdBudget(args.slice(1));
    break;
  case 'resolve':
    cmdResolve(args.slice(1));
    break;
  case 'lint':
    cmdLint(args.slice(1));
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

function printHelp(): void {
  console.log(`
  acr — Agent Capability Runtime CLI

  Commands:
    validate <path>          Validate a capability directory
    validate --all <dir>     Validate all capabilities in a directory
    lint <path>              Lint LOD content quality for a capability
    lint --all <dir>         Lint all capabilities in a directory
    migrate <SKILL.md>       Generate capability from existing skill file
    budget <path>            Calculate context budget for a capability/set/role
    resolve <path>           Show dependency resolution plan

  Options:
    --window <tokens>        Context window size (default: 128000)
    --format <tree|json>     Output format (default: tree)
    --output-dir <dir>       Output directory for migrate (default: ./<name>/)
    --dry-run                Preview without writing files (migrate)
    --all                    Process all capabilities in directory (validate)

  Examples:
    acr validate ./github-pr-review
    acr validate --all ./capabilities
    acr migrate ./skills/linear/SKILL.md
    acr budget ./github-pr-review --window 128000
    acr resolve ./engineering-role.yaml
`);
}

function cmdValidate(args: string[]): void {
  const allMode = args.includes('--all');
  const pathArg = args.find(a => !a.startsWith('--'));

  if (!pathArg) {
    console.error('Usage: acr validate <path>');
    process.exit(1);
  }

  const targetPath = resolvePath(pathArg);

  if (allMode) {
    // Validate all subdirectories
    const entries = readdirSync(targetPath, { withFileTypes: true })
      .filter(e => e.isDirectory());

    let totalErrors = 0;
    let totalWarnings = 0;
    let legacy = 0;

    for (const entry of entries) {
      const dir = join(targetPath, entry.name);
      const hasManifest = existsSync(join(dir, 'capability.yaml'));
      const hasSkill = existsSync(join(dir, 'SKILL.md'));

      if (!hasManifest && hasSkill) {
        console.log(`⚠️  ${entry.name} — legacy skill (no capability.yaml). Run: acr migrate ${dir}/SKILL.md`);
        legacy++;
        continue;
      }

      if (!hasManifest) continue;

      const result = validateCapability(dir);
      if (result.valid) {
        const warnStr = result.warnings.length > 0 ? ` (${result.warnings.length} warnings)` : '';
        console.log(`✅ ${entry.name}${warnStr}`);
      } else {
        console.log(`❌ ${entry.name} — ${result.errors.length} errors`);
        for (const err of result.errors) {
          console.log(`   ${err.path}: ${err.message}`);
          if (err.suggestion) console.log(`   💡 ${err.suggestion}`);
        }
      }
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
    }

    console.log(`\n${entries.length} capabilities checked. ${totalErrors} errors, ${totalWarnings} warnings, ${legacy} legacy skills.`);
    process.exit(totalErrors > 0 ? 1 : 0);
  } else {
    const result = validateCapability(targetPath);
    if (result.valid) {
      console.log(`✅ Valid: ${targetPath}`);
      for (const w of result.warnings) {
        console.log(`  ⚠️  ${w.path}: ${w.message}`);
      }
    } else {
      console.log(`❌ Invalid: ${targetPath}`);
      for (const err of result.errors) {
        console.log(`  ❌ ${err.path}: ${err.message}`);
        if (err.suggestion) console.log(`     💡 ${err.suggestion}`);
      }
      for (const w of result.warnings) {
        console.log(`  ⚠️  ${w.path}: ${w.message}`);
      }
    }
    process.exit(result.valid ? 0 : 1);
  }
}

function cmdLint(args: string[]): void {
  const allMode = args.includes('--all');
  const pathArg = args.find(a => !a.startsWith('--'));

  if (!pathArg) {
    console.error('Usage: acr lint <path> [--all]');
    process.exit(1);
  }

  const targetPath = resolvePath(pathArg);
  const results: ReturnType<typeof lintCapability>[] = [];

  if (allMode) {
    const entries = readdirSync(targetPath, { withFileTypes: true })
      .filter(e => e.isDirectory());

    for (const entry of entries) {
      const dir = join(targetPath, entry.name);
      const manifestPath = join(dir, 'capability.yaml');
      if (!existsSync(manifestPath)) continue;

      try {
        const raw = readFileSync(manifestPath, 'utf-8');
        const manifest = parseYaml(raw) as CapabilityManifest;
        results.push(lintCapability(dir, manifest));
      } catch (err: any) {
        console.error(`  ❌ ${entry.name}: Failed to parse — ${err.message}`);
      }
    }
  } else {
    const manifestPath = join(targetPath, 'capability.yaml');
    if (!existsSync(manifestPath)) {
      console.error(`No capability.yaml found in ${targetPath}`);
      process.exit(1);
    }
    const raw = readFileSync(manifestPath, 'utf-8');
    const manifest = parseYaml(raw) as CapabilityManifest;
    results.push(lintCapability(targetPath, manifest));
  }

  console.log(formatLintResults(results));

  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  process.exit(totalErrors > 0 ? 1 : 0);
}

function cmdMigrate(args: string[]): void {
  const dryRun = args.includes('--dry-run');
  const outputIdx = args.indexOf('--output-dir');
  const outputDir = outputIdx >= 0 ? args[outputIdx + 1] : undefined;
  const skillPath = args.find(a => !a.startsWith('--') && a !== outputDir);

  if (!skillPath) {
    console.error('Usage: acr migrate <SKILL.md> [--output-dir <dir>] [--dry-run]');
    process.exit(1);
  }

  const result = migrateSkill(resolvePath(skillPath));
  const outDir = resolvePath(outputDir ?? `./${result.name}`);

  if (dryRun) {
    console.log(`Would create ${outDir}/`);
    console.log(`  capability.yaml (${result.capabilityYaml.length} bytes)`);
    console.log(`  index.txt (${result.indexTxt.length} bytes)`);
    console.log(`  summary.md (${result.summaryMd.length} bytes)`);
    console.log(`  standard.md (${result.standardMd.length} bytes)`);
    console.log('\n--- capability.yaml preview ---');
    console.log(result.capabilityYaml);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'capability.yaml'), result.capabilityYaml);
  writeFileSync(join(outDir, 'index.txt'), result.indexTxt);
  writeFileSync(join(outDir, 'summary.md'), result.summaryMd);
  writeFileSync(join(outDir, 'standard.md'), result.standardMd);

  console.log(`✅ Migrated to ${outDir}/`);
  console.log(`   capability.yaml — manifest (review TODOs)`);
  console.log(`   index.txt — ${result.indexTxt}`);
  console.log(`   summary.md — auto-generated summary`);
  console.log(`   standard.md — original skill content`);
  console.log(`\nNext: review capability.yaml and fill in TODO sections.`);
}

function cmdBudget(args: string[]): void {
  const windowIdx = args.indexOf('--window');
  const windowSize = windowIdx >= 0 ? parseInt(args[windowIdx + 1], 10) : 128000;
  const formatJson = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';
  const pathArg = args.find(a => !a.startsWith('--') && a !== String(windowSize) && a !== 'json');

  if (!pathArg) {
    console.error('Usage: acr budget <path> [--window <tokens>] [--format json]');
    process.exit(1);
  }

  const manifests = loadManifests(resolvePath(pathArg));
  const plan = resolveCapabilities(manifests, { windowSize });
  const report = calculateBudget(plan);

  if (formatJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n📊 Budget Report (window: ${windowSize.toLocaleString()} tokens)\n`);

  for (const entry of report.perCapability) {
    const bar = '█'.repeat(Math.max(1, Math.round(entry.percentage)));
    console.log(`  ${entry.name.padEnd(25)} ${entry.resolution.padEnd(10)} ${String(entry.tokens).padStart(6)} tok  ${bar} ${entry.percentage.toFixed(1)}%`);
  }

  console.log(`\n  ${'Total'.padEnd(25)} ${''.padEnd(10)} ${String(report.totalBudget).padStart(6)} tok       ${(report.utilization * 100).toFixed(1)}% of window`);

  if (report.burstAnalysis.length > 0) {
    console.log(`\n🔥 Burst Analysis (what if a capability escalates to deep?):\n`);
    for (const burst of report.burstAnalysis) {
      const status = burst.exceedsWindow ? '⚠️  EXCEEDS' : '✅ FITS';
      console.log(`  ${burst.capability}: +${burst.additionalTokens} tok → ${burst.newTotal} tok ${status}`);
      if (burst.suggestedDemotions.length > 0) {
        for (const d of burst.suggestedDemotions) {
          console.log(`    → Demote ${d}`);
        }
      }
    }
  }
}

function cmdResolve(args: string[]): void {
  const windowIdx = args.indexOf('--window');
  const windowSize = windowIdx >= 0 ? parseInt(args[windowIdx + 1], 10) : 128000;
  const formatJson = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';
  const pathArg = args.find(a => !a.startsWith('--') && a !== String(windowSize) && a !== 'json' && a !== 'tree');

  if (!pathArg) {
    console.error('Usage: acr resolve <path> [--window <tokens>] [--format json|tree]');
    process.exit(1);
  }

  const manifests = loadManifests(resolvePath(pathArg));
  const plan = resolveCapabilities(manifests, { windowSize });

  if (formatJson) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log(`\n🔗 Resolution Plan\n`);

  for (const cap of plan.capabilities) {
    const deps = cap.transitiveDependencies.length > 0
      ? ` → depends on: ${cap.transitiveDependencies.join(', ')}`
      : '';
    console.log(`  ${String(cap.loadOrder).padStart(2)}. ${cap.manifest.name} [${cap.resolution}] (${cap.budgetUsed} tok)${deps}`);
  }

  if (plan.conflicts.length > 0) {
    console.log(`\n⚠️  Conflicts:`);
    for (const c of plan.conflicts) {
      console.log(`  ${c.capabilities[0]} ↔ ${c.capabilities[1]} (shared: ${c.sharedProvides.join(', ')})`);
    }
  }

  if (plan.warnings.length > 0) {
    console.log(`\n⚠️  Warnings:`);
    for (const w of plan.warnings) {
      console.log(`  ${w}`);
    }
  }

  console.log(`\n  Total: ${plan.totalBudget} tokens (${(plan.utilization * 100).toFixed(1)}% of ${windowSize.toLocaleString()} window)`);
}

function loadManifests(path: string): CapabilityManifest[] {
  const manifests: CapabilityManifest[] = [];

  if (existsSync(join(path, 'capability.yaml'))) {
    // Single capability
    const raw = readFileSync(join(path, 'capability.yaml'), 'utf-8');
    manifests.push(parseYaml(raw) as CapabilityManifest);
  } else {
    // Directory of capabilities
    const entries = readdirSync(path, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifestPath = join(path, entry.name, 'capability.yaml');
        if (existsSync(manifestPath)) {
          const raw = readFileSync(manifestPath, 'utf-8');
          manifests.push(parseYaml(raw) as CapabilityManifest);
        }
      }
    }
  }

  return manifests;
}
