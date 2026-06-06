#!/usr/bin/env node

import { resolve as resolvePath, join } from 'node:path';
import { existsSync, readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { validateCapability } from '@agentcapabilityruntime/core';
import { resolve as resolveCapabilities } from '@agentcapabilityruntime/core';
import { calculateBudget } from '@agentcapabilityruntime/core';
import { migrateSkill } from '@agentcapabilityruntime/core';
import { detectLegacy, scanCapabilities } from '@agentcapabilityruntime/core';
import { lintCapability, formatLintResults } from '@agentcapabilityruntime/core';
import { buildIndex, searchRegistry, formatSearchResults } from '@agentcapabilityruntime/core';
import { OpenClawAdapter } from '@agentcapabilityruntime/core';
import { parse as parseYaml } from 'yaml';
import type { CapabilityManifest } from '@agentcapabilityruntime/schema';

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
  case 'search':
    cmdSearch(args.slice(1));
    break;
  case 'create':
    cmdCreate(args.slice(1));
    break;
  case 'persona':
    cmdPersona(args.slice(1));
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
    create <type>            Interactive wizard to create a capability
                             Types: client, capability, role
    validate <path>          Validate a capability directory
    validate --all <dir>     Validate all capabilities in a directory
    lint <path>              Lint LOD content quality for a capability
    lint --all <dir>         Lint all capabilities in a directory
    search <query> <dir>     Search capabilities by name, provides, or description
    migrate <SKILL.md>       Generate capability from existing skill file
    budget <path>            Calculate context budget for a capability/set/role
    resolve <path>           Show dependency resolution plan
    persona <path>           Render the boot system prompt for a persona capability

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

function cmdSearch(args: string[]): void {
  if (args.length < 2) {
    console.error('Usage: acr search <query> <capabilities-dir>');
    process.exit(1);
  }

  // Last arg is the directory, everything else is the query
  const dir = resolvePath(args[args.length - 1]);
  const query = args.slice(0, -1).join(' ');

  const index = buildIndex(dir);
  const results = searchRegistry(index, query);

  console.log(`\n🔍 Search: "${query}" (${index.capabilities.length} capabilities indexed)\n`);
  console.log(formatSearchResults(results));

  if (results.length === 0) {
    console.log('  Try a different query or check the directory path.');
  }
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

// ─── Persona Boot ────────────────────────────────────────────────────────

function cmdPersona(args: string[]): void {
  const formatJson = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';
  const pathArg = args.find(a => !a.startsWith('--') && a !== 'json' && a !== 'tree');

  if (!pathArg) {
    console.error('Usage: acr persona <path> [--format json|tree]');
    console.error('  Renders the boot system prompt for a persona capability directory.');
    process.exit(1);
  }

  const dir = resolvePath(pathArg);
  if (!existsSync(join(dir, 'capability.yaml'))) {
    console.error(`No capability.yaml found in ${dir}`);
    process.exit(1);
  }

  const adapter = new OpenClawAdapter();
  const boot = adapter.bootPersona(dir);

  if (formatJson) {
    console.log(JSON.stringify(boot, null, 2));
    return;
  }

  console.log(`\n🎭 Persona boot — ${boot.name} (~${boot.tokenEstimate} tokens)\n`);
  console.log('─'.repeat(60));
  console.log(boot.systemPrompt);
  console.log('─'.repeat(60));
}

// ─── Interactive Create Wizard ───────────────────────────────────────────

function cmdCreate(args: string[]): void {
  const type = args[0];
  const outputIdx = args.indexOf('--output-dir');
  const outputBase = outputIdx >= 0 ? args[outputIdx + 1] : '.';

  switch (type) {
    case 'client':
      runClientWizard(outputBase);
      break;
    case 'capability':
      runCapabilityWizard(outputBase);
      break;
    case 'role':
      runRoleWizard(outputBase);
      break;
    default:
      console.log(`
  acr create — Interactive capability wizard

  Types:
    client        Create a client profile (brand, voice, audience, red lines)
    capability    Create a generic capability (tool, workflow, skill)
    role          Create a role (agent identity + capability composition)

  Usage:
    acr create client [--output-dir <dir>]
    acr create capability [--output-dir <dir>]
    acr create role [--output-dir <dir>]
`);
      process.exit(type ? 1 : 0);
  }
}

function createPrompt(): { ask: (question: string) => Promise<string>; askMulti: (question: string, hint?: string) => Promise<string[]>; askOptional: (question: string) => Promise<string | null>; close: () => void } {
  // Read all lines upfront to handle both interactive and piped input
  const lines: string[] = [];
  let lineIdx = 0;
  let linesReady: (() => void) | null = null;
  let linesLoaded = false;

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });

  // If stdin is piped, pre-read all lines
  if (!process.stdin.isTTY) {
    rl.on('line', (line: string) => lines.push(line));
    rl.on('close', () => {
      linesLoaded = true;
      if (linesReady) linesReady();
    });
  }

  const getNextLine = (): Promise<string> => {
    if (process.stdin.isTTY) {
      // Interactive: use readline question
      return new Promise(resolve => {
        rl.question('', answer => resolve(answer));
      });
    }
    // Piped: wait for all lines then consume sequentially
    return new Promise(resolve => {
      const tryRead = (): void => {
        if (lineIdx < lines.length) {
          resolve(lines[lineIdx++]);
        } else if (linesLoaded) {
          resolve('');
        } else {
          linesReady = () => {
            linesReady = null;
            tryRead();
          };
        }
      };
      tryRead();
    });
  };

  return {
    ask: async (question: string) => {
      process.stdout.write(question);
      const answer = await getNextLine();
      if (!process.stdin.isTTY) process.stdout.write(answer + '\n');
      return answer.trim();
    },
    askMulti: async (question: string, hint?: string) => {
      const items: string[] = [];
      console.log(question);
      if (hint) console.log(`  ${hint}`);

      while (true) {
        process.stdout.write('  > ');
        const answer = await getNextLine();
        if (!process.stdin.isTTY) process.stdout.write(answer + '\n');
        const val = answer.trim();
        if (val === '') break;
        items.push(val);
      }
      return items;
    },
    askOptional: async (question: string) => {
      process.stdout.write(question);
      const answer = await getNextLine();
      if (!process.stdin.isTTY) process.stdout.write(answer + '\n');
      const val = answer.trim();
      return val === '' ? null : val;
    },
    close: () => rl.close(),
  };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function escapeYaml(text: string): string {
  if (/[:#{}[\],&*?|>!%@`]/.test(text) || text.startsWith('"') || text.startsWith("'")) {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return text;
}

async function runClientWizard(outputBase: string): Promise<void> {
  const p = createPrompt();

  console.log('\n🏢 ACR Client Profile Wizard\n');
  console.log('Create a client overlay — brand voice, audience, red lines, and more.');
  console.log('The AI will use this to produce client-specific content.\n');

  // Basic info
  const fullName = await p.ask('🏢 Client name (full): ');
  const shortName = await p.askOptional(`📝 Short name for filenames [${slugify(fullName)}]: `);
  const slug = shortName || slugify(fullName);
  const oneLiner = await p.ask('💬 One-line description: ');

  // Brand voice
  console.log('\n🎨 Brand Voice');
  const voiceTone = await p.ask('   Describe their tone (like you\'d tell a new copywriter):\n   > ');
  const voiceExamples = await p.askMulti('   Examples of good copy (paste real lines, blank to finish):', 'Paste a line that nails their voice');

  // Audience
  const audiences = await p.askMulti('\n👥 Audience segments (blank line to finish):', 'e.g., "College students (18-22)" or "Mid-level donors ($100-500/yr)"');

  // Red lines
  const redLines = await p.askMulti('\n🚫 Red Lines — things to NEVER do (blank to finish):', 'e.g., "Guilt-based appeals" or "Mention competitors"');

  // Brand rules
  const brandRules = await p.askMulti('\n✅ Brand Rules — things to ALWAYS do (blank to finish):', 'e.g., "Say partner not donor" or "Lead with impact stories"');

  // Red team
  const redTeamRules = await p.askMulti('\n🔴 Red Team Rules — what should the critic specifically catch? (blank to finish):', 'e.g., "Language that commodifies suffering"');

  // Key contacts
  const contacts = await p.askMulti('\n👤 Key contacts (format: Name: role/notes, blank to finish):', 'e.g., "Angela: approvals and finance, prefers email"');

  // Campaign history
  const campaignNotes = await p.askMulti('\n📊 Past campaign notes (blank to skip):', 'e.g., "Easter 2025: email series got 29 recurring donors"');

  // Technical
  console.log('\n⚙️  Technical Details (blank to skip any)');
  const donationPlatform = await p.askOptional('   Donation platform: ');
  const emailPlatform = await p.askOptional('   Email platform: ');
  const trackingConventions = await p.askOptional('   Tracking conventions (UTM, SOL codes, etc.): ');

  // Sector
  const sector = await p.askOptional('\n📂 Sector/Industry (e.g., "Higher education", "Disaster relief"): ');

  p.close();

  // ─── Generate files ───

  const triggerPattern = slug.includes('-')
    ? `(?i)(${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${slug})`
    : `(?i)(${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|\\\\b${slug}\\\\b)`;

  // index.txt
  const indexTxt = `${slug}: ${fullName} — ${oneLiner}\n`;

  // summary.md
  let summaryMd = `---\nname: ${slug}\ndescription: ${escapeYaml(`${fullName} — ${oneLiner}`)}\n---\n\n# ${fullName} — Quick Reference\n\n`;
  summaryMd += `- **Full Name:** ${fullName}\n`;
  if (sector) summaryMd += `- **Sector:** ${sector}\n`;
  if (audiences.length > 0) summaryMd += `- **Audience:** ${audiences.join(', ')}\n`;
  summaryMd += `- **Voice:** ${voiceTone}\n`;
  if (redLines.length > 0) summaryMd += `- **Don't:** ${redLines.join(', ')}\n`;
  if (brandRules.length > 0) summaryMd += `- **Do:** ${brandRules.join(', ')}\n`;
  if (contacts.length > 0) summaryMd += `- **Key contacts:** ${contacts.join('; ')}\n`;

  // standard.md
  let standardMd = `---\nname: ${slug}\ndescription: ${escapeYaml(`${fullName} — complete client profile for AI-powered content creation and campaign management.`)}\n---\n\n# ${fullName} — Full Client Profile\n\n`;

  if (sector) standardMd += `## Organization\n\n**Sector:** ${sector}\n\n${fullName} is... *(add a 2-3 sentence description of the organization)*\n\n`;

  standardMd += `## Brand Voice\n\n**Tone:** ${voiceTone}\n\n`;
  if (voiceExamples.length > 0) {
    standardMd += `**Examples of good copy:**\n`;
    for (const ex of voiceExamples) standardMd += `- "${ex}"\n`;
    standardMd += '\n';
  }

  if (audiences.length > 0) {
    standardMd += `## Audience Segments\n\n`;
    for (const aud of audiences) {
      standardMd += `### ${aud}\n- What motivates them: *(fill in)*\n- What turns them off: *(fill in)*\n\n`;
    }
  }

  if (redLines.length > 0) {
    standardMd += `## Red Lines (NEVER do these)\n\n`;
    for (const line of redLines) standardMd += `- ❌ ${line}\n`;
    standardMd += '\n';
  }

  if (brandRules.length > 0) {
    standardMd += `## Brand Rules (ALWAYS do these)\n\n`;
    for (const rule of brandRules) standardMd += `- ✅ ${rule}\n`;
    standardMd += '\n';
  }

  if (redTeamRules.length > 0) {
    standardMd += `## Red Team Rules (Client-Specific)\n\nWhen reviewing content for ${fullName}, flag:\n\n`;
    for (const rule of redTeamRules) standardMd += `- [ ] ${rule}\n`;
    standardMd += '\n';
  }

  if (campaignNotes.length > 0) {
    standardMd += `## Past Campaign Performance\n\n`;
    for (const note of campaignNotes) standardMd += `- ${note}\n`;
    standardMd += '\n';
  }

  const hasTechnical = donationPlatform || emailPlatform || trackingConventions;
  if (hasTechnical) {
    standardMd += `## Technical Details\n\n`;
    if (donationPlatform) standardMd += `- **Donation platform:** ${donationPlatform}\n`;
    if (emailPlatform) standardMd += `- **Email platform:** ${emailPlatform}\n`;
    if (trackingConventions) standardMd += `- **Tracking:** ${trackingConventions}\n`;
    standardMd += '\n';
  }

  if (contacts.length > 0) {
    standardMd += `## Key People\n\n`;
    for (const contact of contacts) {
      const parts = contact.split(':');
      const name = parts[0]?.trim() || contact;
      const role = parts.slice(1).join(':').trim() || '*(add role and notes)*';
      standardMd += `- **${name}:** ${role}\n`;
    }
    standardMd += '\n';
  }

  // capability.yaml
  const coreRules: string[] = [];
  coreRules.push(`When working on ${fullName} content:`);
  coreRules.push(`- Tone: ${voiceTone}`);
  for (const rule of brandRules) coreRules.push(`- ${rule}`);
  for (const line of redLines) coreRules.push(`- NEVER: ${line}`);

  const capabilityYaml = `name: ${slug}
type: capability
version: 1.0.0
description: ${escapeYaml(`${fullName} — ${oneLiner}`)}

provides:
  - client-profile
  - ${slug}

requires:
  tools: []
  capabilities: []
  context: []

budget:
  index: 15
  summary: 200
  standard: 1200

activation:
  triggers:
    - type: pattern
      match: "${triggerPattern}"
  trigger_logic: OR
  co_activates: []
  conflicts: []

permissions:
  data:
    client_data: read-only

behavioral:
  core: |
    ${coreRules.join('\n    ')}
  overlays: []

state_schema:
  version: 1
  max_size_tokens: 100
  fields:
    - name: active_campaign
      type: string
    - name: last_approval_status
      type: string

verification:
  checklist:
    - "Content matches brand voice"
    - "No red line violations"
    - "Audience segment is appropriate"
  completion_signal: content_approved
`;

  // Write files
  const outDir = resolvePath(join(outputBase, slug));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'capability.yaml'), capabilityYaml);
  writeFileSync(join(outDir, 'index.txt'), indexTxt);
  writeFileSync(join(outDir, 'summary.md'), summaryMd);
  writeFileSync(join(outDir, 'standard.md'), standardMd);

  console.log(`\n✅ Created: ${outDir}/`);
  console.log(`   ├── capability.yaml`);
  console.log(`   ├── index.txt`);
  console.log(`   ├── summary.md`);
  console.log(`   └── standard.md`);
  console.log(`\n   Run: acr validate ${outDir}`);
  console.log(`   Edit standard.md to fill in any *(fill in)* placeholders.\n`);
}

async function runCapabilityWizard(outputBase: string): Promise<void> {
  const p = createPrompt();

  console.log('\n🔧 ACR Capability Wizard\n');
  console.log('Create a generic capability — a skill, tool, or workflow.\n');

  const name = await p.ask('📛 Capability name (lowercase, hyphens ok): ');
  const description = await p.ask('📝 Description (one sentence): ');
  const providesTags = await p.askMulti('\n🏷️  Provides tags (what does this capability offer?):', 'e.g., "code-review", "email-copywriting"');
  if (providesTags.length === 0) providesTags.push(name);

  const requiresTools = await p.askMulti('\n🔌 Required MCP tools (blank to skip):', 'e.g., "github", "exec"');
  const requiresCaps = await p.askMulti('\n🔗 Required capabilities (blank to skip):', 'e.g., "git-basics"');

  const triggerPatterns = await p.askMulti('\n⚡ Trigger patterns — regex to auto-activate (blank to skip):', `e.g., "(?i)\\\\b(${name})\\\\b"`);
  if (triggerPatterns.length === 0) triggerPatterns.push(`(?i)\\\\b(${name.replace(/-/g, '.?')})\\\\b`);

  console.log('\n📖 Behavioral Core');
  console.log('   Write the key instructions — what should an AI do when using this capability?');
  const coreInstructions = await p.askMulti('   (one instruction per line, blank to finish):', 'e.g., "Always check CI status before approving a PR"');

  p.close();

  const slug = slugify(name);

  const toolsYaml = requiresTools.length > 0
    ? requiresTools.map(t => `    - mcp: ${t}\n      methods: []\n      optional: false`).join('\n')
    : '[]';

  const capsYaml = requiresCaps.length > 0
    ? requiresCaps.map(c => `    - name: ${c}\n      resolution: summary\n      optional: true`).join('\n')
    : '[]';

  const triggersYaml = triggerPatterns.map(t => `    - type: pattern\n      match: "${t}"`).join('\n');

  const capabilityYaml = `name: ${slug}
type: capability
version: 1.0.0
description: ${escapeYaml(description)}

provides:
${providesTags.map(t => `  - ${t}`).join('\n')}

requires:
  tools:
${toolsYaml.startsWith('[') ? `    ${toolsYaml}` : toolsYaml}
  capabilities:
${capsYaml.startsWith('[') ? `    ${capsYaml}` : capsYaml}
  context: []

budget:
  index: 15
  summary: 200
  standard: 1000

activation:
  triggers:
${triggersYaml}
  trigger_logic: OR
  co_activates: []
  conflicts: []

behavioral:
  core: |
    ${coreInstructions.join('\n    ')}
  overlays: []

verification:
  checklist:
    - "Task completed successfully"
  completion_signal: task_complete
`;

  const indexTxt = `${slug}: ${description}\n`;
  const summaryMd = `---\nname: ${slug}\ndescription: ${escapeYaml(description)}\n---\n\n# ${name} — Summary\n\n${description}\n\n**Key behaviors:**\n${coreInstructions.map(i => `- ${i}`).join('\n')}\n`;
  const standardMd = `---\nname: ${slug}\ndescription: ${escapeYaml(description)}\n---\n\n# ${name}\n\n${description}\n\n## Instructions\n\n${coreInstructions.map((inst, i) => `${i + 1}. ${inst}`).join('\n')}\n\n## Examples\n\n*(Add real-world usage examples here)*\n\n## Common Errors\n\n*(Add common mistakes and how to fix them)*\n`;

  const outDir = resolvePath(join(outputBase, slug));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'capability.yaml'), capabilityYaml);
  writeFileSync(join(outDir, 'index.txt'), indexTxt);
  writeFileSync(join(outDir, 'summary.md'), summaryMd);
  writeFileSync(join(outDir, 'standard.md'), standardMd);

  console.log(`\n✅ Created: ${outDir}/`);
  console.log(`   ├── capability.yaml`);
  console.log(`   ├── index.txt`);
  console.log(`   ├── summary.md`);
  console.log(`   └── standard.md`);
  console.log(`\n   Run: acr validate ${outDir}`);
  console.log(`   Flesh out standard.md with detailed instructions and examples.\n`);
}

async function runRoleWizard(outputBase: string): Promise<void> {
  const p = createPrompt();

  console.log('\n🎭 ACR Role Wizard\n');
  console.log('Create a role — an agent identity with capabilities and policies.\n');

  const name = await p.ask('📛 Role name (e.g., "senior-strategist"): ');
  const description = await p.ask('📝 Description: ');
  const tone = await p.ask('🎨 Tone (how should this agent communicate?): ');

  const capSets = await p.askMulti('\n📦 Capability sets to include:', 'e.g., "campaign-creation", "content-production"');

  const priorities = await p.askMulti('\n⚖️  Priority rules (what matters most?):', 'e.g., "brand-safety > speed" or "accuracy > creativity"');

  const escalations = await p.askMulti('\n🚨 Escalation rules — when should this agent stop and ask a human?', 'e.g., "budget decisions over $500" or "theological content"');

  p.close();

  const slug = slugify(name);

  const roleYaml = `name: ${slug}
version: 1.0.0
description: ${escapeYaml(description)}

compose:
  capability_sets:
${capSets.map((cs, i) => `    - name: ${slugify(cs)}\n      priority: ${i === 0 ? 'high' : 'medium'}`).join('\n')}

policy:
  priorities:
${priorities.map(p => `    - ${p}`).join('\n')}
  escalation:
${escalations.map(e => `    - condition: ${escapeYaml(e)}\n      action: notify_human`).join('\n')}
  tone: ${escapeYaml(tone)}

budget:
  total: 12000
  reserved:
    identity: 500
    active_capabilities: 6000
    standby_summaries: 1000
    flex: 4500
`;

  const outDir = resolvePath(outputBase);
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${slug}.role.yaml`);
  writeFileSync(outFile, roleYaml);

  console.log(`\n✅ Created: ${outFile}`);
  console.log(`   Adjust budget allocations and capability set priorities as needed.\n`);
}

// ─── End Wizard ─────────────────────────────────────────────────────────

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
