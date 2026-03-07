#!/usr/bin/env npx tsx
/**
 * ACR Live Demo — simulates a conversation with dynamic capability management.
 *
 * Watch as capabilities mount, unmount, trigger, and manage budget in real-time.
 */

import { join } from 'node:path';
import { AgentAPI } from '../packages/core/src/agent-api.js';
import type { ACREvent } from '../packages/schema/src/runtime.js';

const EXAMPLES = join(__dirname, '..', 'examples');
const CAPS = ['code-review', 'consult', 'engram-recall', 'linear', 'nestjs']
  .map(name => join(EXAMPLES, name));

// ANSI colors
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

function zoneColor(zone: string): string {
  switch (zone) {
    case 'HOT': return red(zone);
    case 'WARM': return yellow(zone);
    case 'COLD': return cyan(zone);
    default: return zone;
  }
}

function printEvent(event: ACREvent): void {
  const icon = {
    'capability:mounted': '📦',
    'capability:unmounted': '📤',
    'capability:demoted': '⬇️ ',
    'capability:promoted': '⬆️ ',
    'trigger:matched': '⚡',
    'trigger:suppressed': '🚫',
    'state:saved': '💾',
    'state:restored': '♻️ ',
    'state:lost': '⚠️ ',
    'permission:denied': '🔒',
    'permission:logged': '📝',
    'escalation:requested': '🙋',
    'escalation:resolved': '✅',
    'budget:warning': '⚠️ ',
    'budget:overflow': '🚨',
  }[event.type] ?? '•';

  const detail = Object.entries(event.details)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');

  console.log(dim(`  ${icon} ${event.type} ${event.capability ? `[${event.capability}]` : ''} ${detail}`));
}

function printSnapshot(api: AgentAPI): void {
  const snap = api.snapshot();
  const bar = (n: number, max: number) => {
    const width = 40;
    const filled = Math.round((n / max) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  };

  console.log(`\n  ${bold('Context Window')} [${snap.windowSize.toLocaleString()} tokens]`);
  console.log(`  ${bar(snap.budgetUsed, snap.windowSize - snap.residentBudget)} ${(snap.utilization * 100).toFixed(1)}%`);
  console.log(`  Budget: ${snap.budgetUsed} used / ${snap.budgetAvailable} available`);
  console.log(`  Zones: ${red(`HOT:${snap.hotCount}`)} ${yellow(`WARM:${snap.warmCount}`)} ${cyan(`COLD:${snap.coldCount}`)}`);
  console.log();

  for (const cap of snap.capabilities) {
    const res = cap.resolution.padEnd(8);
    const tokens = String(cap.budgetUsed).padStart(5);
    console.log(`  ${zoneColor(cap.zone.padEnd(4))} ${cap.name.padEnd(20)} ${res} ${tokens} tok`);
  }
  console.log();
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(bold('\n🔬 ACR Live Demo\n'));
  console.log(dim('Simulating a conversation with 5 capabilities registered.\n'));

  // ─── Initialize ─────────────────────────────────────────────────

  const api = new AgentAPI({
    windowSize: 10000,  // Small window to force interesting budget behavior
    residentBudget: 500,
    capabilityDirs: CAPS,
    sessionId: 'demo-session',
    defaultPermissionPolicy: 'allow-with-log',
  });

  api.on(printEvent);

  console.log(green('✅ Registered 5 capabilities'));
  printSnapshot(api);
  await sleep(500);

  // ─── Turn 1: User asks about code review ────────────────────────

  console.log(bold('═══════════════════════════════════════════'));
  console.log(bold('👤 User: "Can you review the PR on the engram repo?"'));
  console.log(bold('═══════════════════════════════════════════'));

  const turn1 = await api.processMessage('Can you review the PR on the engram repo?');
  console.log(`\n  Triggers fired: ${turn1.triggers.length}`);
  for (const t of turn1.triggers) {
    console.log(`    → ${t.capabilityName} (${t.triggerType}: "${t.matchedText || t.condition}")`);
  }

  // Also manually mount code-review if trigger didn't fire
  if (!turn1.triggers.find(t => t.capabilityName === 'code-review')) {
    console.log(dim('\n  (Manually mounting code-review for demo)'));
    await api.mount('code-review');
  }

  printSnapshot(api);
  await sleep(500);

  // ─── Turn 2: Need to recall context from memory ─────────────────

  console.log(bold('═══════════════════════════════════════════'));
  console.log(bold('👤 User: "What do you remember about the engram architecture?"'));
  console.log(bold('═══════════════════════════════════════════'));

  const turn2 = await api.processMessage('What do you remember about the engram architecture?');
  console.log(`\n  Triggers fired: ${turn2.triggers.length}`);

  if (!turn2.triggers.find(t => t.capabilityName === 'engram-recall')) {
    console.log(dim('\n  (Manually mounting engram-recall for demo)'));
    await api.mount('engram-recall');
  }

  printSnapshot(api);
  await sleep(500);

  // ─── Turn 3: Mount deep — force budget pressure ─────────────────

  console.log(bold('═══════════════════════════════════════════'));
  console.log(bold('👤 User: "I need deep NestJS reference for the service layer"'));
  console.log(bold('═══════════════════════════════════════════'));

  console.log(dim('\n  Requesting nestjs at DEEP resolution (heavy)...'));
  const deepResult = await api.mount('nestjs', 'deep');

  if (deepResult.success) {
    console.log(green(`\n  ✅ Mounted nestjs at deep (${deepResult.budgetUsed} tokens)`));
    if (deepResult.demotions.length > 0) {
      console.log(yellow('\n  Budget pressure! Demotions:'));
      for (const d of deepResult.demotions) {
        console.log(`    ${d.capability}: ${d.from} → ${d.to} (saved ${d.tokensSaved} tok)`);
      }
    }
  } else {
    console.log(red(`\n  ❌ Mount failed: ${deepResult.message}`));
    console.log(dim('  Trying at standard instead...'));
    await api.mount('nestjs', 'standard');
  }

  printSnapshot(api);
  await sleep(500);

  // ─── Turn 4: Unmount and show state persistence ─────────────────

  console.log(bold('═══════════════════════════════════════════'));
  console.log(bold('👤 User: "Ok, done with the code review for now"'));
  console.log(bold('═══════════════════════════════════════════'));

  // Save some state first
  api.updateState('code-review', { currentPR: 'heybeaux/engram#42', filesReviewed: 7 });
  console.log(dim('\n  Saved state: { currentPR: "heybeaux/engram#42", filesReviewed: 7 }'));

  const unmountResult = await api.unmount('code-review');
  console.log(`\n  Unmounted code-review (was: ${unmountResult.previousResolution})`);
  console.log(`  State serialized: ${unmountResult.stateSerialized}`);
  console.log(`  Triggers suppressed: ${unmountResult.triggersSuppressed}`);

  printSnapshot(api);
  await sleep(500);

  // ─── Turn 5: Permission check ───────────────────────────────────

  console.log(bold('═══════════════════════════════════════════'));
  console.log(bold('🔒 Permission Check: Can we use Linear tools?'));
  console.log(bold('═══════════════════════════════════════════'));

  await api.mount('linear');
  const allowed = api.checkPermission('linear', 'create_issue', 'linear');
  const merge = api.checkPermission('github', 'merge_pull_request', 'linear');

  console.log(`\n  linear.create_issue: ${allowed.allowed ? green('ALLOWED') : red('DENIED')} (logged: ${allowed.logged})`);
  console.log(`  github.merge_pull_request: ${merge.allowed ? green('ALLOWED') : red('DENIED')} (logged: ${merge.logged})`);

  printSnapshot(api);
  await sleep(500);

  // ─── Turn 6: Context generation ─────────────────────────────────

  console.log(bold('═══════════════════════════════════════════'));
  console.log(bold('📄 Generated Context (what the agent sees)'));
  console.log(bold('═══════════════════════════════════════════'));

  const context = api.getContext();
  const contextLines = context.split('\n');
  const preview = contextLines.slice(0, 25).join('\n');
  console.log(dim(preview));
  if (contextLines.length > 25) {
    console.log(dim(`\n  ... (${contextLines.length - 25} more lines, ${context.length} total chars)`));
  }

  // ─── Final snapshot ─────────────────────────────────────────────

  console.log(bold('\n═══════════════════════════════════════════'));
  console.log(bold('📊 Final State'));
  console.log(bold('═══════════════════════════════════════════'));
  printSnapshot(api);

  // Cleanup
  await api.cleanup();
  console.log(green('✅ Session cleaned up.\n'));
}

main().catch(console.error);
