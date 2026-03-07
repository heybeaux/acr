/**
 * ACR Observability — event logging, metrics, and debug mode.
 *
 * Tracks: which capabilities mounted when, trigger firings,
 * state persistence events, permission decisions, budget pressure.
 *
 * Two modes:
 *   - Production: structured event stream, metric counters
 *   - Debug: verbose console output with timing
 */

import type {
  ACREvent,
  ACREventType,
  ACREventHandler,
  MountedCapability,
  ContextSnapshot,
} from '@acr/schema';

export interface ObservabilityConfig {
  /** Enable debug mode (verbose console output) */
  debug?: boolean;

  /** Custom event handler */
  onEvent?: ACREventHandler;

  /** Log to file path (JSON lines) */
  logFile?: string;

  /** Include timestamps in logs (default: true) */
  timestamps?: boolean;
}

export interface SessionMetrics {
  /** Total mount operations */
  mounts: number;
  /** Total unmount operations */
  unmounts: number;
  /** Total demotions triggered */
  demotions: number;
  /** Total promotions */
  promotions: number;
  /** Trigger matches */
  triggerMatches: number;
  /** Trigger suppressions (agent unmounted, trigger ignored) */
  triggerSuppressions: number;
  /** State saves */
  stateSaves: number;
  /** State restores */
  stateRestores: number;
  /** State lost (version mismatch) */
  stateLosses: number;
  /** Permission denials */
  permissionDenials: number;
  /** Escalation requests */
  escalations: number;
  /** Budget overflow events */
  budgetOverflows: number;
  /** Peak budget utilization (0-1) */
  peakUtilization: number;
  /** Session start time */
  startedAt: number;
  /** Capability mount timeline */
  timeline: TimelineEntry[];
}

export interface TimelineEntry {
  timestamp: number;
  event: ACREventType;
  capability: string;
  detail?: string;
}

/**
 * Observer — collects events, computes metrics, enables debug output.
 */
export class Observer {
  private readonly config: Required<ObservabilityConfig>;
  private readonly handlers: ACREventHandler[] = [];
  private readonly events: ACREvent[] = [];
  private readonly metrics: SessionMetrics;

  constructor(config: ObservabilityConfig = {}) {
    this.config = {
      debug: config.debug ?? false,
      onEvent: config.onEvent ?? (() => {}),
      logFile: config.logFile ?? '',
      timestamps: config.timestamps ?? true,
    };

    if (config.onEvent) {
      this.handlers.push(config.onEvent);
    }

    this.metrics = {
      mounts: 0,
      unmounts: 0,
      demotions: 0,
      promotions: 0,
      triggerMatches: 0,
      triggerSuppressions: 0,
      stateSaves: 0,
      stateRestores: 0,
      stateLosses: 0,
      permissionDenials: 0,
      escalations: 0,
      budgetOverflows: 0,
      peakUtilization: 0,
      startedAt: Date.now(),
      timeline: [],
    };
  }

  /**
   * Subscribe to events.
   */
  on(handler: ACREventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  /**
   * Emit an event. Updates metrics and notifies handlers.
   */
  emit(event: ACREvent): void {
    this.events.push(event);
    this.updateMetrics(event);

    if (this.config.debug) {
      this.debugLog(event);
    }

    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // Don't let handler errors break the runtime
      }
    }
  }

  /**
   * Update budget utilization tracking.
   */
  updateUtilization(snapshot: ContextSnapshot): void {
    if (snapshot.utilization > this.metrics.peakUtilization) {
      this.metrics.peakUtilization = snapshot.utilization;
    }
  }

  /**
   * Get current session metrics.
   */
  getMetrics(): Readonly<SessionMetrics> {
    return { ...this.metrics, timeline: [...this.metrics.timeline] };
  }

  /**
   * Get all recorded events.
   */
  getEvents(): readonly ACREvent[] {
    return this.events;
  }

  /**
   * Get events filtered by type.
   */
  getEventsByType(type: ACREventType): ACREvent[] {
    return this.events.filter(e => e.type === type);
  }

  /**
   * Format a human-readable session report.
   */
  report(): string {
    const m = this.metrics;
    const duration = ((Date.now() - m.startedAt) / 1000).toFixed(1);
    const lines: string[] = [
      '╔══════════════════════════════════════╗',
      '║       ACR Session Report             ║',
      '╚══════════════════════════════════════╝',
      '',
      `Duration:             ${duration}s`,
      `Peak utilization:     ${(m.peakUtilization * 100).toFixed(1)}%`,
      '',
      '─── Operations ───',
      `  Mounts:             ${m.mounts}`,
      `  Unmounts:           ${m.unmounts}`,
      `  Demotions:          ${m.demotions}`,
      `  Promotions:         ${m.promotions}`,
      '',
      '─── Triggers ───',
      `  Matches:            ${m.triggerMatches}`,
      `  Suppressions:       ${m.triggerSuppressions}`,
      '',
      '─── State ───',
      `  Saves:              ${m.stateSaves}`,
      `  Restores:           ${m.stateRestores}`,
      `  Lost (ver mismatch): ${m.stateLosses}`,
      '',
      '─── Security ───',
      `  Permission denials: ${m.permissionDenials}`,
      `  Escalations:        ${m.escalations}`,
      '',
      '─── Budget ───',
      `  Overflow events:    ${m.budgetOverflows}`,
    ];

    if (m.timeline.length > 0) {
      lines.push('', '─── Timeline ───');
      const start = m.timeline[0].timestamp;
      for (const entry of m.timeline.slice(-20)) {
        const t = ((entry.timestamp - start) / 1000).toFixed(1);
        const detail = entry.detail ? ` — ${entry.detail}` : '';
        lines.push(`  +${t}s  ${entry.event}  ${entry.capability}${detail}`);
      }
      if (m.timeline.length > 20) {
        lines.push(`  ... (${m.timeline.length - 20} earlier events omitted)`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Reset metrics (for testing).
   */
  reset(): void {
    this.events.length = 0;
    Object.assign(this.metrics, {
      mounts: 0, unmounts: 0, demotions: 0, promotions: 0,
      triggerMatches: 0, triggerSuppressions: 0,
      stateSaves: 0, stateRestores: 0, stateLosses: 0,
      permissionDenials: 0, escalations: 0, budgetOverflows: 0,
      peakUtilization: 0, startedAt: Date.now(), timeline: [],
    });
  }

  // ── Internal ──────────────────────────────────────────────

  private updateMetrics(event: ACREvent): void {
    const m = this.metrics;

    switch (event.type) {
      case 'capability:mounted':
        m.mounts++;
        break;
      case 'capability:unmounted':
        m.unmounts++;
        break;
      case 'capability:demoted':
        m.demotions++;
        break;
      case 'capability:promoted':
        m.promotions++;
        break;
      case 'trigger:matched':
        m.triggerMatches++;
        break;
      case 'trigger:suppressed':
        m.triggerSuppressions++;
        break;
      case 'state:saved':
        m.stateSaves++;
        break;
      case 'state:restored':
        m.stateRestores++;
        break;
      case 'state:lost':
        m.stateLosses++;
        break;
      case 'permission:denied':
        m.permissionDenials++;
        break;
      case 'escalation:requested':
        m.escalations++;
        break;
      case 'budget:overflow':
        m.budgetOverflows++;
        break;
    }

    // Add to timeline
    if (event.capability) {
      m.timeline.push({
        timestamp: event.timestamp,
        event: event.type,
        capability: event.capability,
        detail: event.details?.reason as string | undefined,
      });
    }
  }

  private debugLog(event: ACREvent): void {
    const ts = this.config.timestamps
      ? `[${new Date(event.timestamp).toISOString()}] `
      : '';
    const cap = event.capability ? ` ${event.capability}` : '';
    const details = Object.entries(event.details)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');

    console.log(`${ts}[ACR:${event.type}]${cap} ${details}`);
  }
}

/**
 * Create an ACR event.
 */
export function createEvent(
  type: ACREventType,
  capability: string | undefined,
  details: Record<string, unknown> = {},
): ACREvent {
  return {
    type,
    timestamp: Date.now(),
    capability,
    details,
  };
}
