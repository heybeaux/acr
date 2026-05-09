import type {
  StateStore,
  SerializedState,
  StateSchema,
  StateField,
} from '@agentcapabilityruntime/schema';

/**
 * In-memory state store implementation.
 * Suitable for single-session use and testing.
 * Production implementations should use persistent storage.
 */
export class InMemoryStateStore implements StateStore {
  private readonly store: Map<string, SerializedState> = new Map();

  private key(sessionId: string, capabilityName: string): string {
    return `${sessionId}:${capabilityName}`;
  }

  async save(sessionId: string, state: SerializedState): Promise<void> {
    this.store.set(this.key(sessionId, state.capabilityName), state);
  }

  async load(
    sessionId: string,
    capabilityName: string,
    capabilityVersion: string,
  ): Promise<SerializedState | null> {
    const state = this.store.get(this.key(sessionId, capabilityName));
    if (!state) return null;

    // Version mismatch → discard
    if (state.capabilityVersion !== capabilityVersion) {
      this.store.delete(this.key(sessionId, capabilityName));
      return null;
    }

    return state;
  }

  async delete(sessionId: string, capabilityName: string): Promise<void> {
    this.store.delete(this.key(sessionId, capabilityName));
  }

  async deleteSession(sessionId: string): Promise<void> {
    const prefix = `${sessionId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /** For testing/debugging */
  get size(): number {
    return this.store.size;
  }
}

/**
 * Serialize capability state according to its state_schema.
 * Enforces max_size_tokens by truncating fields in reverse declaration order.
 */
export function serializeState(
  capabilityName: string,
  capabilityVersion: string,
  schema: StateSchema,
  fieldValues: Record<string, unknown>,
): SerializedState {
  const fields: Record<string, unknown> = {};
  let estimatedTokens = 0;

  // Process fields in declaration order
  for (const field of schema.fields) {
    const value = fieldValues[field.name];
    if (value === undefined) continue;

    const fieldTokens = estimateFieldTokens(field, value);

    if (estimatedTokens + fieldTokens > schema.max_size_tokens) {
      // Would exceed budget — skip remaining fields (truncate in reverse order)
      break;
    }

    fields[field.name] = value;
    estimatedTokens += fieldTokens;
  }

  return {
    capabilityName,
    capabilityVersion,
    schemaVersion: schema.version,
    fields,
    serializedAt: Date.now(),
    tokenCount: estimatedTokens,
  };
}

/**
 * Format serialized state for injection into agent context.
 */
export function formatStateForContext(state: SerializedState): string {
  const lines = [`Prior state for ${state.capabilityName} (v${state.capabilityVersion}):`];

  for (const [key, value] of Object.entries(state.fields)) {
    if (Array.isArray(value)) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`  ${key}: ${String(value)}`);
    }
  }

  return lines.join('\n');
}

function estimateFieldTokens(field: StateField, value: unknown): number {
  const serialized = JSON.stringify(value);
  // Rough estimate: 1 token ≈ 4 chars
  return Math.ceil(serialized.length / 4) + Math.ceil(field.name.length / 4) + 2;
}
