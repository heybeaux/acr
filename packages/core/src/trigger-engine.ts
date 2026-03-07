import type {
  CapabilityManifest,
  CompiledTrigger,
  TriggerMatch,
  RuntimeState,
} from '@acr/schema';

// ─── Lightweight Semantic Similarity ─────────────────────────────────
// TF-IDF cosine similarity — no external API, no embeddings model needed.
// Fast enough for per-message evaluation. Not as good as real embeddings,
// but dramatically better than regex for paraphrase detection.

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'were', 'they',
  'their', 'what', 'when', 'where', 'which', 'who', 'will', 'with', 'this',
  'that', 'from', 'into', 'some', 'than', 'them', 'then', 'these', 'would',
  'make', 'like', 'just', 'over', 'such', 'take', 'also', 'back', 'after',
  'could', 'should', 'about', 'other', 'very', 'your', 'does', 'please',
  'help', 'need', 'want', 'let', 'how', 'get',
]);

function buildTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  // Normalize
  const max = Math.max(...tf.values(), 1);
  for (const [key, val] of tf) {
    tf.set(key, val / max);
  }
  return tf;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  const allKeys = new Set([...a.keys(), ...b.keys()]);
  for (const key of allKeys) {
    const va = a.get(key) ?? 0;
    const vb = b.get(key) ?? 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }

  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

/**
 * Trigger Engine — evaluates activation triggers for unmounted capabilities.
 *
 * Pattern triggers are precompiled to regex at registration time.
 * Runtime event triggers are evaluated against system state.
 */
export class TriggerEngine {
  private readonly index: Map<string, CompiledTrigger[]> = new Map();
  private readonly semanticIndex: Map<string, { tf: Map<string, number>; threshold: number }> = new Map();

  /**
   * Register a capability's triggers into the index.
   * Compiles pattern triggers to regex at registration time.
   * Builds TF-IDF vectors for semantic triggers.
   */
  register(manifest: CapabilityManifest): void {
    const triggers = manifest.activation?.triggers;

    // Always register semantic index from description + provides (even without explicit semantic triggers)
    const semanticText = [
      manifest.name.replace(/[-_.]/g, ' '),
      manifest.description,
      ...(manifest.provides ?? []),
    ].join(' ');
    const tokens = tokenize(semanticText);
    if (tokens.length > 0) {
      // Find semantic trigger threshold, or use default
      const semanticTrigger = triggers?.find(t => t.type === 'semantic');
      this.semanticIndex.set(manifest.name, {
        tf: buildTermFrequency(tokens),
        threshold: semanticTrigger?.threshold ?? 0.35,
      });
    }

    if (!triggers || triggers.length === 0) return;

    const logic = manifest.activation?.trigger_logic ?? 'OR';

    const compiled: CompiledTrigger[] = triggers
      .filter(t => t.type !== 'semantic') // semantic handled separately
      .map(t => ({
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
    this.semanticIndex.delete(capabilityName);
  }

  /**
   * Evaluate triggers against a user message.
   *
   * Uses a hybrid strategy (per panel feedback):
   * 1. Fast regex pattern matching first
   * 2. Semantic similarity fallback for capabilities without regex matches
   *
   * Only checks capabilities NOT in the skip set (typically HOT capabilities).
   */
  evaluatePatterns(
    message: string,
    skipCapabilities: Set<string> = new Set(),
  ): TriggerMatch[] {
    const matches: TriggerMatch[] = [];
    const matchedCaps = new Set<string>();

    // Pass 1: Fast regex matching
    for (const [capName, triggers] of this.index) {
      if (skipCapabilities.has(capName)) continue;

      const patternTriggers = triggers.filter(t => t.type === 'pattern' && t.regex);
      if (patternTriggers.length === 0) continue;

      const logic = patternTriggers[0].triggerLogic;

      if (logic === 'OR') {
        for (const trigger of patternTriggers) {
          const match = trigger.regex!.exec(message);
          if (match) {
            matches.push({
              capabilityName: capName,
              triggerType: 'pattern',
              matchedText: match[0],
            });
            matchedCaps.add(capName);
            break;
          }
        }
      } else {
        const allMatch = patternTriggers.every(t => t.regex!.test(message));
        if (allMatch) {
          matches.push({
            capabilityName: capName,
            triggerType: 'pattern',
            matchedText: message,
          });
          matchedCaps.add(capName);
        }
      }
    }

    // Pass 2: Semantic similarity for capabilities that didn't match via regex
    const messageTf = buildTermFrequency(tokenize(message));
    if (messageTf.size > 0) {
      for (const [capName, entry] of this.semanticIndex) {
        if (skipCapabilities.has(capName) || matchedCaps.has(capName)) continue;

        const similarity = cosineSimilarity(messageTf, entry.tf);
        if (similarity >= entry.threshold) {
          matches.push({
            capabilityName: capName,
            triggerType: 'semantic' as any,
            matchedText: `similarity=${similarity.toFixed(3)}`,
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
