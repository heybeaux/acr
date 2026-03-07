import type { ResolutionPlan, ResolutionLevel } from '@acr/schema';

export interface BudgetReport {
  totalBudget: number;
  windowSize: number;
  utilization: number;
  perCapability: CapabilityBudgetEntry[];
  burstAnalysis: BurstScenario[];
}

export interface CapabilityBudgetEntry {
  name: string;
  resolution: ResolutionLevel;
  tokens: number;
  percentage: number;
}

export interface BurstScenario {
  capability: string;
  currentResolution: ResolutionLevel;
  burstResolution: 'deep';
  additionalTokens: number;
  newTotal: number;
  exceedsWindow: boolean;
  suggestedDemotions: string[];
}

/**
 * Generate a budget report from a resolution plan.
 */
export function calculateBudget(plan: ResolutionPlan): BudgetReport {
  const perCapability: CapabilityBudgetEntry[] = plan.capabilities.map(c => ({
    name: c.manifest.name,
    resolution: c.resolution,
    tokens: c.budgetUsed,
    percentage: (c.budgetUsed / plan.windowSize) * 100,
  }));

  // Burst analysis: what if each capability escalates to deep?
  const burstAnalysis: BurstScenario[] = plan.capabilities
    .filter(c => c.resolution !== 'deep' && c.manifest.budget.deep)
    .map(c => {
      const deepBudget = c.manifest.budget.deep ?? c.budgetUsed;
      const additionalTokens = deepBudget - c.budgetUsed;
      const newTotal = plan.totalBudget + additionalTokens;
      const exceedsWindow = newTotal > plan.windowSize;

      // Find candidates for demotion (lowest budget impact first)
      const suggestedDemotions: string[] = [];
      if (exceedsWindow) {
        let freed = 0;
        const needed = newTotal - plan.windowSize;
        const others = plan.capabilities
          .filter(o => o.manifest.name !== c.manifest.name && o.resolution !== 'index')
          .sort((a, b) => a.budgetUsed - b.budgetUsed);

        for (const other of others) {
          const savings = other.budgetUsed - other.manifest.budget.index;
          if (savings > 0) {
            suggestedDemotions.push(
              `${other.manifest.name}: ${other.resolution} → index (saves ${savings} tokens)`
            );
            freed += savings;
            if (freed >= needed) break;
          }
        }
      }

      return {
        capability: c.manifest.name,
        currentResolution: c.resolution,
        burstResolution: 'deep' as const,
        additionalTokens,
        newTotal,
        exceedsWindow,
        suggestedDemotions,
      };
    });

  return {
    totalBudget: plan.totalBudget,
    windowSize: plan.windowSize,
    utilization: plan.utilization,
    perCapability,
    burstAnalysis,
  };
}
