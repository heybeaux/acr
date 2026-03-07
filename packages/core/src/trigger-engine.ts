import type {
  CapabilityManifest,
  CompiledTrigger,
  TriggerMatch,
  RuntimeState,
} from '@acr/schema';

/**
 * Trigger Engine — evaluates activation triggers for unmounted capabilities.
 *
 * Pattern triggers are precompiled to regex at registration time.
 * Runtime event triggers are evaluated against system state.
 */
export class TriggerEngine {
  private readonly index: Map<string, CompiledTrigger[]> = new Map();

  /**
   * Register a capability's triggers into the index.
   * Compiles pattern triggers to regex at registration time.
   */
  register(manifest: CapabilityManifest): void {
    const triggers = manifest.activation?.triggers;
    if (!triggers || triggers.length === 0) return;

    const logic = manifest.activation?.trigger_logic ?? 'OR';

    const compiled: CompiledTrigger[] = triggers.map(t => ({
      capabilityName: manifest.name,
      type: t.type,
      regex: t.type === 'pattern' && t.match ? new RegExp(t.match, 'i') : undefined,
      condition: t.type === 'runtime_event' ? t.condition : undefined,
      triggerLogic: logic,
      allTriggers: [], // filled below
    }));

    // Cross-reference for AND logic
    for (const ct of compiled) {
      ct.allTriggers = compiled;
    }

    this.index.set(manifest.name, compiled);
  }

  /**
   * Unregister a capability's triggers.
   */
  unregister(capabilityName: string): void {
    this.index.delete(capabilityName);
  }

  /**
   * Evaluate pattern triggers against a user message.
   * Only checks capabilities NOT in the skip set (typically HOT capabilities).
   * Short-circuits on first match for OR logic.
   */
  evaluatePatterns(
    message: string,
    skipCapabilities: Set<string> = new Set(),
  ): TriggerMatch[] {
    const matches: TriggerMatch[] = [];

    for (const [capName, triggers] of this.index) {
      if (skipCapabilities.has(capName)) continue;

      const patternTriggers = triggers.filter(t => t.type === 'pattern' && t.regex);
      if (patternTriggers.length === 0) continue;

      const logic = patternTriggers[0].triggerLogic;

      if (logic === 'OR') {
        // Short-circuit: first match wins
        for (const trigger of patternTriggers) {
          const match = trigger.regex!.exec(message);
          if (match) {
            matches.push({
              capabilityName: capName,
              triggerType: 'pattern',
              matchedText: match[0],
            });
            break; // one match per capability is enough for OR
          }
        }
      } else {
        // AND: all pattern triggers must match
        const allMatch = patternTriggers.every(t => t.regex!.test(message));
        if (allMatch) {
          matches.push({
            capabilityName: capName,
            triggerType: 'pattern',
            matchedText: message,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Evaluate runtime event triggers against system state.
   * Called at session start and on state changes.
   */
  evaluateRuntimeEvents(
    state: RuntimeState,
    skipCapabilities: Set<string> = new Set(),
  ): TriggerMatch[] {
    const matches: TriggerMatch[] = [];

    for (const [capName, triggers] of this.index) {
      if (skipCapabilities.has(capName)) continue;

      const eventTriggers = triggers.filter(t => t.type === 'runtime_event' && t.condition);
      if (eventTriggers.length === 0) continue;

      const logic = eventTriggers[0].triggerLogic;

      const evaluateCondition = (condition: string): boolean => {
        // Built-in condition evaluators
        const toolMatch = condition.match(/^tool_available\(["'](.+?)["']\)$/);
        if (toolMatch) {
          return state.availableTools.includes(toolMatch[1]);
        }

        const sessionMatch = condition.match(/^session_type\(["'](.+?)["']\)$/);
        if (sessionMatch) {
          return state.sessionType === sessionMatch[1];
        }

        // Check custom state
        const customMatch = condition.match(/^state\.(\w+)\s*===?\s*["']?(.+?)["']?$/);
        if (customMatch) {
          return String(state.customState[customMatch[1]]) === customMatch[2];
        }

        return false;
      };

      if (logic === 'OR') {
        for (const trigger of eventTriggers) {
          if (evaluateCondition(trigger.condition!)) {
            matches.push({
              capabilityName: capName,
              triggerType: 'runtime_event',
              condition: trigger.condition,
            });
            break;
          }
        }
      } else {
        const allMatch = eventTriggers.every(t => evaluateCondition(t.condition!));
        if (allMatch) {
          matches.push({
            capabilityName: capName,
            triggerType: 'runtime_event',
            condition: eventTriggers.map(t => t.condition).join(' AND '),
          });
        }
      }
    }

    return matches;
  }

  /**
   * Get all registered capability names.
   */
  registeredCapabilities(): string[] {
    return Array.from(this.index.keys());
  }

  /**
   * Get trigger count for debugging.
   */
  get size(): number {
    let count = 0;
    for (const triggers of this.index.values()) {
      count += triggers.length;
    }
    return count;
  }
}
