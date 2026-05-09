/**
 * ACR TestKit — testing utilities for framework integrations.
 *
 * Allows framework authors to assert capability loading behavior
 * without running the full ACR runtime.
 *
 * Usage:
 *   const kit = new ACRTestKit();
 *   kit.registerMock('nestjs', { budget: { index: 15, summary: 100, standard: 600 } });
 *   const result = kit.assertMountsOn("Create a NestJS endpoint", ['nestjs']);
 */

import type { CapabilityManifest, ResolutionLevel } from '@agentcapabilityruntime/schema';

export interface MockCapabilityOptions {
  name?: string;
  description?: string;
  provides?: string[];
  budget?: { index: number; summary: number; standard: number; deep?: number };
  triggers?: Array<{ type: string; condition: string }>;
  priority?: string;
}

export interface MountAssertion {
  passed: boolean;
  expectedCapabilities: string[];
  actualCapabilities: string[];
  missing: string[];
  unexpected: string[];
  message: string;
}

export interface ResolutionAssertion {
  passed: boolean;
  capability: string;
  expectedResolution: ResolutionLevel;
  actualResolution: ResolutionLevel | null;
  message: string;
}

/**
 * ACR TestKit for framework integration testing.
 */
export class ACRTestKit {
  private manifests: Map<string, CapabilityManifest> = new Map();
  private content: Map<string, Map<string, string>> = new Map();

  /**
   * Register a mock capability for testing.
   */
  registerMock(name: string, options: MockCapabilityOptions = {}): void {
    const manifest: CapabilityManifest = {
      name,
      type: 'capability',
      version: '1.0.0-test',
      description: options.description ?? `Test capability: ${name}`,
      provides: options.provides ?? [name],
      requires: { tools: [], capabilities: [], context: [] },
      budget: options.budget ?? { index: 15, summary: 100, standard: 500 },
      activation: options.triggers ? {
        triggers: options.triggers.map(t => ({
          type: t.type as any,
          condition: t.condition,
        })),
      } : undefined,
      priority: (options.priority as any) ?? 'medium',
    } as CapabilityManifest;

    this.manifests.set(name, manifest);

    // Create mock content
    const contentMap = new Map<string, string>();
    contentMap.set('index', `${name}: ${manifest.description}`);
    contentMap.set('summary', `# ${name}\n\n${manifest.description}\n\nKey features: testing`);
    contentMap.set('standard', `# ${name}\n\n${manifest.description}\n\nFull reference content for testing.`);
    this.content.set(name, contentMap);
  }

  /**
   * Assert that specific capabilities would mount for a given input.
   */
  assertMountsOn(
    input: string,
    expectedCapabilities: string[],
  ): MountAssertion {
    const inputLower = input.toLowerCase();
    const matched: string[] = [];

    for (const [name, manifest] of this.manifests) {
      let matchScore = 0;

      // Check triggers
      if (manifest.activation?.triggers) {
        for (const trigger of manifest.activation.triggers) {
          if (trigger.type === 'pattern' && trigger.condition) {
            try {
              if (new RegExp(trigger.condition, 'i').test(input)) {
                matchScore += 50;
              }
            } catch {}
          }
        }
      }

      // Check name match
      const nameTokens = name.toLowerCase().split(/[-_.]/);
      for (const token of nameTokens) {
        if (token.length > 2 && inputLower.includes(token)) {
          matchScore += 20;
        }
      }

      if (matchScore > 0) {
        matched.push(name);
      }
    }

    const missing = expectedCapabilities.filter(c => !matched.includes(c));
    const unexpected = matched.filter(c => !expectedCapabilities.includes(c));
    const passed = missing.length === 0;

    return {
      passed,
      expectedCapabilities,
      actualCapabilities: matched,
      missing,
      unexpected,
      message: passed
        ? `✅ All ${expectedCapabilities.length} expected capabilities matched`
        : `❌ Missing: ${missing.join(', ')}`,
    };
  }

  /**
   * Assert a capability would mount at a specific resolution.
   */
  assertResolution(
    capabilityName: string,
    expectedResolution: ResolutionLevel,
    budgetAvailable: number,
  ): ResolutionAssertion {
    const manifest = this.manifests.get(capabilityName);
    if (!manifest) {
      return {
        passed: false,
        capability: capabilityName,
        expectedResolution,
        actualResolution: null,
        message: `❌ Capability "${capabilityName}" not registered`,
      };
    }

    // Determine what resolution would be used given budget
    const levels: ResolutionLevel[] = ['deep', 'standard', 'summary', 'index'];
    let actualResolution: ResolutionLevel = 'index';

    for (const level of levels) {
      const budget = this.getBudget(manifest, level);
      if (budget <= budgetAvailable) {
        actualResolution = level;
        break;
      }
    }

    const passed = actualResolution === expectedResolution;

    return {
      passed,
      capability: capabilityName,
      expectedResolution,
      actualResolution,
      message: passed
        ? `✅ ${capabilityName} at ${actualResolution}`
        : `❌ ${capabilityName}: expected ${expectedResolution}, got ${actualResolution}`,
    };
  }

  /**
   * Get all registered mock manifests.
   */
  getManifests(): CapabilityManifest[] {
    return [...this.manifests.values()];
  }

  /**
   * Reset all mocks.
   */
  reset(): void {
    this.manifests.clear();
    this.content.clear();
  }

  private getBudget(manifest: CapabilityManifest, resolution: ResolutionLevel): number {
    switch (resolution) {
      case 'deep': return manifest.budget.deep ?? manifest.budget.standard;
      case 'standard': return manifest.budget.standard;
      case 'summary': return manifest.budget.summary;
      case 'index': return manifest.budget.index;
    }
  }
}
