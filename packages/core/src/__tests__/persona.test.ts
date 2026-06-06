import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import _Ajv2020 from 'ajv/dist/2020.js';
const Ajv = (_Ajv2020 as any).default || _Ajv2020;
import { capabilitySchema } from '@agentcapabilityruntime/schema';
import { renderPersona } from '../loader.js';
import { LODLoader } from '../loader.js';
import { ContextManager } from '../context-manager.js';
import type { CapabilityManifest, Persona } from '@agentcapabilityruntime/schema';

const EXAMPLES_DIR = join(__dirname, '..', '..', '..', '..', 'examples');

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(capabilitySchema);

function validate(manifest: unknown): boolean {
  return validateSchema(manifest) as boolean;
}

function makeManifest(overrides: Partial<CapabilityManifest> & { name: string }): CapabilityManifest {
  return {
    version: '1.0.0',
    type: 'capability',
    description: `${overrides.name} test capability`,
    provides: [overrides.name],
    budget: { index: 10, summary: 100, standard: 500 },
    behavioral: { core: `Do ${overrides.name} stuff.` },
    ...overrides,
  };
}

// ─── renderPersona ────────────────────────────────────────────────

describe('renderPersona', () => {
  it('renders all fields when fully populated', () => {
    const persona: Persona = {
      identity: 'Kit — VP of Making Shit Happen',
      voice: 'Direct, scrappy, dry humor',
      values: ['Be genuinely helpful', 'Have opinions'],
      do: ['Be resourceful before asking'],
      dont: ['Send half-baked replies', 'Use sycophantic filler'],
      relationship: 'Teammate and co-founder to Beaux',
    };

    const output = renderPersona(persona);

    expect(output).toContain('## Persona');
    expect(output).toContain('**Identity:** Kit — VP of Making Shit Happen');
    expect(output).toContain('**Voice:** Direct, scrappy, dry humor');
    expect(output).toContain('**Values:**');
    expect(output).toContain('- Be genuinely helpful');
    expect(output).toContain('**Do:**');
    expect(output).toContain('- Be resourceful before asking');
    expect(output).toContain("**Don't:**");
    expect(output).toContain('- Send half-baked replies');
    expect(output).toContain('**Relationship:** Teammate and co-founder to Beaux');
  });

  it('renders only identity when only identity is set', () => {
    const persona: Persona = { identity: 'Solo Agent' };
    const output = renderPersona(persona);

    expect(output).toContain('## Persona');
    expect(output).toContain('**Identity:** Solo Agent');
    expect(output).not.toContain('**Voice:**');
    expect(output).not.toContain('**Values:**');
    expect(output).not.toContain('**Do:**');
    expect(output).not.toContain("**Don't:**");
    expect(output).not.toContain('**Relationship:**');
  });

  it('returns empty string for an empty persona object', () => {
    const output = renderPersona({});
    expect(output).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(renderPersona(undefined)).toBe('');
  });
});

// ─── resolveAgentProfile ─────────────────────────────────────────

describe('LODLoader.resolveAgentProfile', () => {
  let loader: LODLoader;

  beforeEach(() => {
    loader = new LODLoader();
  });

  function registerManifest(manifest: CapabilityManifest) {
    // Register directly by inserting into internals via register() with a temp dir trick.
    // Use a minimal stub that bypasses disk: leverage that loader.register reads capability.yaml
    // from disk. Instead, expose internal via cast and inject directly.
    (loader as any).paths.set(manifest.name, '/stub');
    (loader as any).manifests.set(manifest.name, manifest);
  }

  it('persona present → persona section precedes behavioral core', () => {
    const manifest = makeManifest({
      name: 'persona-test',
      persona: {
        identity: 'Test Agent',
        voice: 'Clear and concise',
      },
      behavioral: { core: 'Behavioral core instructions here.' },
    });

    registerManifest(manifest);
    const profile = loader.resolveAgentProfile('persona-test');

    expect(profile).toContain('## Persona');
    expect(profile).toContain('**Identity:** Test Agent');
    expect(profile).toContain('Behavioral core instructions here.');

    const personaIdx = profile.indexOf('## Persona');
    const coreIdx = profile.indexOf('Behavioral core instructions here.');
    expect(personaIdx).toBeLessThan(coreIdx);
  });

  it('persona absent → output equals behavioral core only (regression guard)', () => {
    const manifest = makeManifest({
      name: 'no-persona',
      behavioral: { core: 'Just the behavioral core.' },
    });

    registerManifest(manifest);
    const profile = loader.resolveAgentProfile('no-persona');

    expect(profile).toBe('Just the behavioral core.');
    expect(profile).not.toContain('## Persona');
  });
});

// ─── ContextManager.generateContext with persona ──────────────────

describe('ContextManager.generateContext with persona', () => {
  it('includes persona section before behavioral core when persona is set', async () => {
    const cm = new ContextManager({
      windowSize: 128000,
      residentBudget: 2000,
      defaultPermissionPolicy: 'allow-with-log',
      sessionId: 'persona-cm-test',
    });

    const manifest = makeManifest({
      name: 'agent-with-persona',
      persona: {
        identity: 'Helpful Agent',
        values: ['Be honest'],
      },
      behavioral: { core: 'Core behavioral text.' },
    });

    cm.registerCapability(manifest);
    await cm.mount('agent-with-persona', 'standard');

    const context = cm.generateContext();

    expect(context).toContain('## Persona');
    expect(context).toContain('**Identity:** Helpful Agent');
    expect(context).toContain('Core behavioral text.');

    const personaIdx = context.indexOf('## Persona');
    const coreIdx = context.indexOf('Core behavioral text.');
    expect(personaIdx).toBeLessThan(coreIdx);
  });

  it('no persona block when persona is absent', async () => {
    const cm = new ContextManager({
      windowSize: 128000,
      residentBudget: 2000,
      defaultPermissionPolicy: 'allow-with-log',
      sessionId: 'no-persona-cm-test',
    });

    const manifest = makeManifest({
      name: 'agent-no-persona',
      behavioral: { core: 'Core text only.' },
    });

    cm.registerCapability(manifest);
    await cm.mount('agent-no-persona', 'standard');

    const context = cm.generateContext();
    expect(context).not.toContain('## Persona');
    expect(context).toContain('Core text only.');
  });
});

// ─── Schema validation ────────────────────────────────────────────

describe('Schema validation — persona block', () => {
  it('manifest WITH a valid persona block validates', () => {
    const manifest = makeManifest({
      name: 'schema-persona-valid',
      persona: {
        identity: 'Test Agent',
        voice: 'Clear and direct',
        values: ['Be helpful'],
        do: ['Read before asking'],
        dont: ['Use filler'],
        relationship: 'Teammate',
      },
    });

    expect(validate(manifest)).toBe(true);
  });

  it('manifest with persona containing unknown field FAILS (additionalProperties: false)', () => {
    const manifest = makeManifest({
      name: 'schema-persona-unknown',
      persona: {
        identity: 'Test Agent',
        unknownField: 'should fail',
      } as any,
    });

    expect(validate(manifest)).toBe(false);
  });

  it('existing manifest WITHOUT persona still validates (backward compat)', () => {
    const manifest = makeManifest({
      name: 'schema-no-persona',
    });

    expect(validate(manifest)).toBe(true);
  });

  it('Kit.capability.yaml validates with its persona block', () => {
    const raw = readFileSync(join(EXAMPLES_DIR, 'agent-persona', 'Kit.capability.yaml'), 'utf-8');
    const manifest = parseYaml(raw) as CapabilityManifest;

    expect(manifest.name).toBe('kit-persona');
    expect(manifest.persona).toBeDefined();
    expect(manifest.persona?.identity).toContain('Kit');
    expect(validate(manifest)).toBe(true);
  });
});
