/**
 * StableClaw Streaming Execution Monitor
 *
 * Provides real-time observability into agent execution progress.
 * Emits structured events for each execution phase, enabling
 * Dashboard, CLI, and WebSocket clients to display live progress.
 *
 * Key design principles (inspired by Claude Code's execution model):
 * - Every phase transition emits a typed event
 * - Events are sequenced and timestamped for replay
 * - Subscribers can filter by severity/phase
 * - Automatic stall detection for stuck executions
 * - Memory-bounded circular buffer for recent history
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import type {
  ExecutionPhase,
  ExecutionProgressEvent,
  ExecutionSnapshot,
  ExecutionSubscriber,
  UnsubscribeFn,
} from "./types.js";

const log = createSubsystemLogger("execution/monitor");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_HISTORY_SIZE = 500;
const CHECK_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// ExecutionMonitor
// ---------------------------------------------------------------------------

export class ExecutionMonitor {
  private subscribers = new Map<number, ExecutionSubscriber>();
  private nextSubscriberId = 0;
  private activeRuns = new Map<
    string,
    {
      startedAt: number;
      lastEventAt: number;
      lastSummary: string;
      phase: ExecutionPhase;
      eventCount: number;
      errorCount: number;
      seq: number;
      tokenUsage?: { inputTokens: number; outputTokens: number };
    }
  >();
  private history: ExecutionProgressEvent[] = [];
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodically check for stalled executions
    this.checkTimer = setInterval(() => {
      this.checkStalledExecutions();
    }, CHECK_INTERVAL_MS);
  }

  // ---- Subscription API ---------------------------------------------------

  subscribe(subscriber: ExecutionSubscriber): UnsubscribeFn {
    const id = this.nextSubscriberId++;
    this.subscribers.set(id, subscriber);
    return () => {
      this.subscribers.delete(id);
    };
  }

  // ---- Event emission -----------------------------------------------------

  emitEvent(params: {
    runId: string;
    phase: ExecutionPhase;
    summary: string;
    detail?: string;
    severity?: "info" | "warn" | "error";
    toolName?: string;
    toolCallId?: string;
    tokenUsage?: { inputTokens: number; outputTokens: number };
  }): ExecutionProgressEvent {
    const now = Date.now();
    let run = this.activeRuns.get(params.runId);

    if (!run) {
      // Auto-register new run
      run = {
        startedAt: now,
        lastEventAt: now,
        lastSummary: params.summary,
        phase: params.phase,
        eventCount: 0,
        errorCount: 0,
        seq: 0,
      };
      this.activeRuns.set(params.runId, run);
    }

    run.seq += 1;
    run.lastEventAt = now;
    run.lastSummary = params.summary;
    run.phase = params.phase;
    run.eventCount += 1;

    if (params.severity === "error") {
      run.errorCount += 1;
    }
    if (params.tokenUsage) {
      run.tokenUsage = params.tokenUsage;
    }

    const event: ExecutionProgressEvent = {
      seq: run.seq,
      ts: now,
      runId: params.runId,
      phase: params.phase,
      summary: params.summary,
      detail: params.detail,
      severity: params.severity,
      toolName: params.toolName,
      toolCallId: params.toolCallId,
      elapsedMs: now - run.startedAt,
      tokenUsage: params.tokenUsage
        ? { ...params.tokenUsage }
        : run.tokenUsage
          ? { ...run.tokenUsage }
          : undefined,
    };

    // Append to circular history buffer
    this.history.push(event);
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history.shift();
    }

    // Notify subscribers
    for (const subscriber of this.subscribers.values()) {
      try {
        subscriber.onEvent?.(event);
      } catch (err) {
        // Subscriber errors must not break the monitor
        log.warn(`Subscriber error: ${String(err)}`);
      }
    }

    // Auto-cleanup terminal runs after notifying
    if (this.isTerminalPhase(params.phase)) {
      // Notify terminal subscribers
      const snapshot = this.getSnapshot(params.runId);
      if (snapshot) {
        for (const subscriber of this.subscribers.values()) {
          try {
            subscriber.onTerminal?.(snapshot);
          } catch (err) {
            log.warn(`Terminal subscriber error: ${String(err)}`);
          }
        }
      }
      // Keep the run record around briefly for queries, then clean up
      setTimeout(() => {
        this.activeRuns.delete(params.runId);
      }, 60_000);
    }

    return event;
  }

  // ---- Query API ----------------------------------------------------------

  getSnapshot(runId: string): ExecutionSnapshot | undefined {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return undefined;
    }
    return {
      runId,
      sessionKey: undefined,
      phase: run.phase,
      startedAt: run.startedAt,
      lastEventAt: run.lastEventAt,
      lastSummary: run.lastSummary,
      eventCount: run.eventCount,
      errorCount: run.errorCount,
      tokenUsage: run.tokenUsage,
    };
  }

  getActiveRunIds(): string[] {
    return Array.from(this.activeRuns.keys());
  }

  getRecentHistory(runId?: string, limit = 50): ExecutionProgressEvent[] {
    if (runId) {
      return this.history
        .filter((e) => e.runId === runId)
        .slice(-limit);
    }
    return this.history.slice(-limit);
  }

  isActive(runId: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return false;
    }
    return !this.isTerminalPhase(run.phase);
  }

  // ---- Stall detection ----------------------------------------------------

  private checkStalledExecutions(): void {
    const now = Date.now();
    const STALL_THRESHOLD_MS = 120_000; // 2 minutes without progress

    for (const [runId, run] of this.activeRuns) {
      if (this.isTerminalPhase(run.phase)) {
        continue;
      }
      const idle = now - run.lastEventAt;
      if (idle > STALL_THRESHOLD_MS) {
        log.warn(
          `Execution stall detected: runId=${runId}, ` +
            `phase=${run.phase}, idle=${Math.round(idle / 1000)}s`,
        );
        this.emitEvent({
          runId,
          phase: run.phase,
          summary: `Execution appears stalled (no progress for ${Math.round(idle / 1000)}s)`,
          severity: "warn",
        });
      }
    }
  }

  // ---- Lifecycle ----------------------------------------------------------

  dispose(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.subscribers.clear();
    this.activeRuns.clear();
    this.history = [];
  }

  // ---- Helpers ------------------------------------------------------------

  private isTerminalPhase(phase: ExecutionPhase): boolean {
    return (
      phase === "succeeded" ||
      phase === "failed" ||
      phase === "timed_out" ||
      phase === "cancelled"
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let globalMonitor: ExecutionMonitor | undefined;

export function getExecutionMonitor(): ExecutionMonitor {
  if (!globalMonitor) {
    globalMonitor = new ExecutionMonitor();
  }
  return globalMonitor;
}

export function resetExecutionMonitorForTest(): void {
  if (globalMonitor) {
    globalMonitor.dispose();
  }
  globalMonitor = undefined;
}
