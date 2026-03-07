#!/usr/bin/env npx tsx
/**
 * OpenClaw + ACR Integration Demo
 *
 * Loads real workspace skills (30 of them!) and shows how ACR would manage
 * them dynamically instead of flat-loading everything into the prompt.
 */

import { OpenClawAdapter } from '../packages/core/src/adapters/openclaw.js';
import type { ACREvent } from '../packages/schema/src/runtime.js';

// ANSI
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const SKILLS_DIR = '/root/.openclaw/workspace/skills';
const ACR_EXAMPLES = '/tmp/acr/examples';

async function main() {
  console.log(bold('\n🔌 OpenClaw + ACR Integration Demo\n'));

  // ─── Setup ──────────────────────────────────────────────────────

  const adapter = new OpenClawAdapter({
    windowSize: 128000,
    residentBudget: 10000,
    skillsBudget: 20000,   // 20K tokens for capabilities
    sessionId: 'openclaw-demo',
  });

  // Track events
  const events: ACREvent[] = [];
  adapter.on(e => events.push(e));

  console.log(dim('Loading skills from two directories:'));
  console.log(dim(`  1. ${ACR_EXAMPLES} (ACR native)`));
  console.log(dim(`  2. ${SKILLS_DIR} (legacy SKILL.md files)`));
  console.log();

  const loadResult = adapter.loadSkillDirs([ACR_EXAMPLES, SKILLS_DIR]);

  console.log(green(`✅ Loaded ${loadResult.total} capabilities:`));
  console.log(`   ACR native: ${loadResult.acr.length} (${loadResult.acr.join(', ')})`);
  console.log(`   Legacy:     ${loadResult.legacy.length} skills auto-detected`);
  if (loadResult.skipped.length > 0) {
    console.log(dim(`   Skipped:    ${loadResult.skipped.length} (${loadResult.skipped.join(', ')})`));
  }

  // ─── Baseline: show what OpenClaw does today ────────────────────

  const status = adapter.getStatus();
  console.log(`\n${bold('📊 Initial State:')}`);
  console.log(`   Capabilities: ${status.snapshot.capabilities.length}`);
  console.log(`   Budget used: ${status.snapshot.budgetUsed} tokens`);
  console.log(`   Budget available: ${status.snapshot.budgetAvailable} tokens`);
  console.log(`   All in COLD zone (index only)`);
  console.log(dim(`   Compare: OpenClaw currently loads ALL skills = ~30K+ tokens\n`));

  // ─── Simulate conversation turns ───────────────────────────────

  const turns = [
    { user: 'Can you check Linear for any open ACR tickets?', expect: 'linear' },
    { user: 'I need to recall what we discussed about the engram architecture', expect: 'engram' },
    { user: 'Let me do a code review on the PR', expect: 'code-review' },
    { user: 'Actually, let\'s consult the expert panel about this design', expect: 'consult' },
    { user: 'Can you help me write a NestJS service for this?', expect: 'nestjs' },
  ];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    console.log(bold(`\n═══════════════════════════════════════════`));
    console.log(bold(`Turn ${i + 1}: "${turn.user}"`));
    console.log(bold(`═══════════════════════════════════════════`));

    events.length = 0;
    const result = await adapter.onMessage(turn.user);

    // Show triggers
    if (result.triggers.length > 0) {
      for (const t of result.triggers) {
        console.log(green(`  ⚡ Trigger: ${t.capabilityName} matched "${t.matchedText || t.condition}"`));
      }
    } else {
      console.log(dim(`  No triggers fired (manual mount would be needed)`));
    }

    // Show events
    for (const e of events) {
      const icon = e.type.includes('mounted') ? '📦' :
                   e.type.includes('demoted') ? '⬇️' :
                   e.type.includes('trigger') ? '⚡' : '•';
      console.log(dim(`  ${icon} ${e.type} ${e.capability ?? ''}`));
    }

    // Show snapshot
    const snap = result.snapshot;
    const hotCaps = snap.capabilities.filter(c => c.zone === 'HOT');
    const warmCaps = snap.capabilities.filter(c => c.zone === 'WARM');

    console.log(`\n  Budget: ${snap.budgetUsed}/${snap.budgetAvailable + snap.budgetUsed} tokens (${(snap.utilization * 100).toFixed(1)}%)`);
    if (hotCaps.length > 0) {
      console.log(`  ${red('HOT')}: ${hotCaps.map(c => `${c.name}(${c.budgetUsed})`).join(', ')}`);
    }
    if (warmCaps.length > 0) {
      console.log(`  ${yellow('WARM')}: ${warmCaps.map(c => `${c.name}(${c.budgetUsed})`).join(', ')}`);
    }
    console.log(`  ${cyan('COLD')}: ${snap.coldCount} capabilities at index`);

    console.log(dim(`  Context size: ~${result.tokenEstimate} tokens`));
  }

  // ─── Comparison ─────────────────────────────────────────────────

  console.log(bold('\n═══════════════════════════════════════════'));
  console.log(bold('📊 ACR vs Flat Loading Comparison'));
  console.log(bold('═══════════════════════════════════════════'));

  const finalSnap = adapter.getStatus().snapshot;
  const acrTokens = finalSnap.budgetUsed;

  // Estimate flat loading: all 30+ skills fully injected
  // Average SKILL.md is ~2K tokens, so 30 * 2000 = 60,000 tokens
  const flatEstimate = loadResult.total * 2000;

  console.log(`\n  ${bold('Flat loading (today):')}`);
  console.log(`    All ${loadResult.total} skills in prompt: ~${flatEstimate.toLocaleString()} tokens`);
  console.log(`    Window utilization: ~${((flatEstimate / 128000) * 100).toFixed(0)}%`);
  console.log(`    Relevant skills: maybe 2-3 per turn`);

  console.log(`\n  ${bold('ACR (dynamic):')}`);
  console.log(`    Active capabilities: ${finalSnap.hotCount} HOT + ${finalSnap.warmCount} WARM`);
  console.log(`    Budget used: ${acrTokens.toLocaleString()} tokens`);
  console.log(`    Window utilization: ${(finalSnap.utilization * 100).toFixed(1)}%`);
  console.log(`    ${green(`Savings: ~${((1 - acrTokens / flatEstimate) * 100).toFixed(0)}% fewer tokens`)}`);
  console.log(`    ${green(`= ${(flatEstimate - acrTokens).toLocaleString()} tokens freed for conversation`)}`);

  await adapter.cleanup();
  console.log(green('\n✅ Done.\n'));
}

main().catch(console.error);
