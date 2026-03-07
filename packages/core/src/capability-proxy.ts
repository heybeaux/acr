import type {
  CapabilityManifest,
  DefaultPermissionPolicy,
  ProxyDecision,
  EscalationRequest,
  EscalationResult,
  ACREvent,
  ACREventHandler,
} from '@acr/schema';

/**
 * Capability Proxy — enforces permissions between agent and tool router.
 *
 * Sits between the agent and tool calls, checking permissions from
 * the currently active capability's manifest.
 */
export class CapabilityProxy {
  private readonly policy: DefaultPermissionPolicy;
  private readonly eventHandlers: ACREventHandler[] = [];
  private readonly approvedOnce: Set<string> = new Set(); // "tool:method" keys
  private readonly auditLog: ProxyDecision[] = [];

  constructor(policy: DefaultPermissionPolicy = 'allow-with-log') {
    this.policy = policy;
  }

  /**
   * Check whether a tool call is allowed under the active capability's permissions.
   */
  check(
    activeCapability: CapabilityManifest | null,
    tool: string,
    method: string,
  ): ProxyDecision {
    const capName = activeCapability?.name ?? 'unknown';

    // No active capability — use default policy
    if (!activeCapability) {
      return this.applyDefault(capName, tool, method);
    }

    // No permissions block — use default policy
    const permissions = activeCapability.permissions;
    if (!permissions?.tools) {
      return this.applyDefault(capName, tool, method);
    }

    // Check specific tool
    const toolPerms = permissions.tools[tool];
    if (!toolPerms) {
      return this.applyDefault(capName, tool, method);
    }

    // Check specific method
    const methodPerm = toolPerms[method];
    if (!methodPerm) {
      return this.applyDefault(capName, tool, method);
    }

    if (methodPerm === 'allow') {
      const decision: ProxyDecision = {
        allowed: true,
        capability: capName,
        tool,
        method,
        logged: false,
      };
      return decision;
    }

    // Check if previously approved-once
    const onceKey = `${tool}:${method}`;
    if (this.approvedOnce.has(onceKey)) {
      this.approvedOnce.delete(onceKey); // consume the one-time approval
      const decision: ProxyDecision = {
        allowed: true,
        capability: capName,
        tool,
        method,
        reason: 'Approved once by human',
        logged: true,
      };
      this.log(decision);
      return decision;
    }

    // Denied
    const decision: ProxyDecision = {
      allowed: false,
      capability: capName,
      tool,
      method,
      reason: `Permission denied: ${tool}.${method}`,
      escalation: `capabilities.escalate('${tool}', '${method}', 'reason')`,
      alternatives: [`Request human approval via escalation`],
      logged: true,
    };

    this.log(decision);
    this.emit({
      type: 'permission:denied',
      timestamp: Date.now(),
      capability: capName,
      details: { tool, method },
    });

    return decision;
  }

  /**
   * Record an escalation approval.
   */
  recordApproval(result: EscalationResult): void {
    if (result.decision === 'approve-once') {
      this.approvedOnce.add(`${result.tool}:${result.method}`);
    }

    this.emit({
      type: 'escalation:resolved',
      timestamp: Date.now(),
      details: {
        tool: result.tool,
        method: result.method,
        decision: result.decision,
      },
    });
  }

  /**
   * Create an escalation request.
   */
  createEscalation(
    capability: string,
    tool: string,
    method: string,
    reason: string,
  ): EscalationRequest {
    const request: EscalationRequest = {
      id: `esc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      capability,
      tool,
      method,
      reason,
      requestedAt: Date.now(),
    };

    this.emit({
      type: 'escalation:requested',
      timestamp: Date.now(),
      capability,
      details: { tool, method, reason, escalationId: request.id },
    });

    return request;
  }

  /**
   * Subscribe to proxy events.
   */
  on(handler: ACREventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Get the audit log.
   */
  getAuditLog(): readonly ProxyDecision[] {
    return this.auditLog;
  }

  private applyDefault(capability: string, tool: string, method: string): ProxyDecision {
    if (this.policy === 'deny') {
      const decision: ProxyDecision = {
        allowed: false,
        capability,
        tool,
        method,
        reason: `No permission defined — default policy: deny`,
        escalation: `capabilities.escalate('${tool}', '${method}', 'reason')`,
        logged: true,
      };
      this.log(decision);
      this.emit({
        type: 'permission:denied',
        timestamp: Date.now(),
        capability,
        details: { tool, method, reason: 'default-deny' },
      });
      return decision;
    }

    // allow-with-log
    const decision: ProxyDecision = {
      allowed: true,
      capability,
      tool,
      method,
      logged: true,
    };
    this.log(decision);
    this.emit({
      type: 'permission:logged',
      timestamp: Date.now(),
      capability,
      details: { tool, method },
    });
    return decision;
  }

  private log(decision: ProxyDecision): void {
    this.auditLog.push(decision);
  }

  private emit(event: ACREvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }
}
