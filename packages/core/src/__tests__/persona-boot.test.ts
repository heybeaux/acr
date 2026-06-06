import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenClawAdapter } from '../adapters/openclaw.js';

const PERSONA_YAML = `
name: kit-test-persona
type: capability
version: 1.0.0
description: "Test persona for boot path."
budget:
  index: 15
  summary: 200
  standard: 2000
persona:
  identity: "Kit — VP of Making Shit Happen."
  voice: "Direct, scrappy, dry humor."
  values:
    - "Be genuinely helpful"
  do:
    - "Be resourceful before asking"
  dont:
    - "Send half-baked replies"
  relationship: "Teammate to Beaux."
behavioral:
  core: |
    You are Kit. Operate with intent.
`;

const NO_PERSONA_YAML = `
name: plain-test-cap
type: capability
version: 1.0.0
description: "Capability with no persona block."
budget:
  index: 15
  summary: 200
  standard: 2000
behavioral:
  core: |
    You are a plain capability.
`;

function writeCapDir(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'acr-persona-'));
  writeFileSync(join(dir, 'capability.yaml'), yaml, 'utf-8');
  return dir;
}

describe('OpenClawAdapter.bootPersona', () => {
  let adapter: OpenClawAdapter;
  const dirs: string[] = [];

  beforeEach(() => {
    adapter = new OpenClawAdapter();
  });

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it('boots an agent system prompt from a persona capability dir', () => {
    const dir = writeCapDir(PERSONA_YAML);
    dirs.push(dir);

    const boot = adapter.bootPersona(dir);

    expect(boot.name).toBe('kit-test-persona');
    expect(boot.tokenEstimate).toBeGreaterThan(0);
    expect(boot.systemPrompt).toContain('## Persona');
    expect(boot.systemPrompt).toContain('VP of Making Shit Happen');
    expect(boot.systemPrompt).toContain('You are Kit. Operate with intent.');
  });

  it('renders the persona block before the behavioral core', () => {
    const dir = writeCapDir(PERSONA_YAML);
    dirs.push(dir);

    const boot = adapter.bootPersona(dir);
    const personaIdx = boot.systemPrompt.indexOf('## Persona');
    const coreIdx = boot.systemPrompt.indexOf('You are Kit. Operate with intent.');

    expect(personaIdx).toBeGreaterThanOrEqual(0);
    expect(coreIdx).toBeGreaterThan(personaIdx);
  });

  it('falls back to behavioral-only when no persona block is present', () => {
    const dir = writeCapDir(NO_PERSONA_YAML);
    dirs.push(dir);

    const boot = adapter.bootPersona(dir);

    expect(boot.systemPrompt).not.toContain('## Persona');
    expect(boot.systemPrompt).toContain('You are a plain capability.');
  });

  it('surfaces the persona block in the per-turn skills prompt once mounted', async () => {
    const dir = writeCapDir(PERSONA_YAML);
    dirs.push(dir);

    adapter.bootPersona(dir);
    await adapter.mountSkill('kit-test-persona', 'summary');

    const prompt = adapter.generateSkillsPrompt();
    expect(prompt).toContain('## Persona');
    expect(prompt).toContain('VP of Making Shit Happen');
  });
});
