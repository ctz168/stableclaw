/**
 * Sub-agent progress reporting interface.
 *
 * This module provides a structured event system for tracking sub-agent
 * execution progress in real-time. It emits events on the existing
 * `agent-events` bus using the `"progress"` stream, allowing any UI or
 * monitoring layer to subscribe without modifying the core agent engine.
 *
 * ## Usage
 *
 * ```ts
 * import { onSubagentProgress } from "./subagent-progress.js";
 *
 * const unsubscribe = onSubagentProgress((event) => {
 *   console.log(`[${event.runId}] ${event.phase}: ${event.message}`);
 *   // event contains: runId, phase, message, detail, timestamp, metadata
 * });
 *
 * // Later:
 * unsubscribe();
 * ```
 *
 * ## Event Phases
 *
 * | Phase | When | Detail |
 * |-------|------|--------|
 * | `spawned` | Sub-agent process created | sessionKey, model, task |
 * | `started` | First LLM turn begins | model, provider |
 * | `tool_call` | Sub-agent invokes a tool | toolName, toolInput |
 * | `tool_result` | Tool execution completes | toolName, success, durationMs |
 * | `thinking` | LLM reasoning in progress | tokenCount (if available) |
 * | `text` | LLM produces text output | tokenCount |
 * | `error` | Recoverable error during execution | errorCode, errorMessage |
 * | `completed` | Sub-agent finishes successfully | outcome, totalDurationMs |
 * | `killed` | Sub-agent was terminated | reason |
 * | `timeout` | Sub-agent exceeded time limit | timeoutSeconds |
 * | `steer` | Sub-agent received steer message | steerMessage |
 */

import { emitAgentEvent, onAgentEvent, type AgentEventPayload } from "../infra/agent-events.js";

// ─── Stream Identifier ───────────────────────────────────────────────

export const SUBAGENT_PROGRESS_STREAM = "progress" as const;

// ─── Phase Constants ─────────────────────────────────────────────────

export const SUBAGENT_PROGRESS_PHASE_SPAWNED = "spawned" as const;
export const SUBAGENT_PROGRESS_PHASE_STARTED = "started" as const;
export const SUBAGENT_PROGRESS_PHASE_TOOL_CALL = "tool_call" as const;
export const SUBAGENT_PROGRESS_PHASE_TOOL_RESULT = "tool_result" as const;
export const SUBAGENT_PROGRESS_PHASE_THINKING = "thinking" as const;
export const SUBAGENT_PROGRESS_PHASE_TEXT = "text" as const;
export const SUBAGENT_PROGRESS_PHASE_ERROR = "error" as const;
export const SUBAGENT_PROGRESS_PHASE_COMPLETED = "completed" as const;
export const SUBAGENT_PROGRESS_PHASE_KILLED = "killed" as const;
export const SUBAGENT_PROGRESS_PHASE_TIMEOUT = "timeout" as const;
export const SUBAGENT_PROGRESS_PHASE_STEER = "steer" as const;

export type SubagentProgressPhase =
  | typeof SUBAGENT_PROGRESS_PHASE_SPAWNED
  | typeof SUBAGENT_PROGRESS_PHASE_STARTED
  | typeof SUBAGENT_PROGRESS_PHASE_TOOL_CALL
  | typeof SUBAGENT_PROGRESS_PHASE_TOOL_RESULT
  | typeof SUBAGENT_PROGRESS_PHASE_THINKING
  | typeof SUBAGENT_PROGRESS_PHASE_TEXT
  | typeof SUBAGENT_PROGRESS_PHASE_ERROR
  | typeof SUBAGENT_PROGRESS_PHASE_COMPLETED
  | typeof SUBAGENT_PROGRESS_PHASE_KILLED
  | typeof SUBAGENT_PROGRESS_PHASE_TIMEOUT
  | typeof SUBAGENT_PROGRESS_PHASE_STEER
  | (string & {});

// ─── Event Payload ───────────────────────────────────────────────────

export type SubagentProgressEvent = {
  /** Unique run identifier */
  runId: string;
  /** Current execution phase */
  phase: SubagentProgressPhase;
  /** Human-readable progress message (one-line) */
  message: string;
  /** Structured detail for the current phase (varies by phase) */
  detail?: Record<string, unknown>;
  /** Monotonic event sequence number (from agent-events) */
  seq: number;
  /** Timestamp (epoch ms, from agent-events) */
  ts: number;
  /** Session key of the child agent (for correlating with session) */
  sessionKey?: string;
  /** Parent agent's session key (for UI grouping) */
  parentSessionKey?: string;
  /** Optional label/tag for the sub-agent (e.g. "research", "code-review") */
  label?: string;
};

// ─── Phase-specific Detail Types ─────────────────────────────────────

/** Detail for `spawned` phase */
export type SubagentProgressDetailSpawned = {
  sessionKey: string;
  model?: string;
  task: string;
  runtime?: "subagent" | "acp";
};

/** Detail for `started` phase */
export type SubagentProgressDetailStarted = {
  model?: string;
  provider?: string;
};

/** Detail for `tool_call` phase */
export type SubagentProgressDetailToolCall = {
  toolName: string;
  toolInput?: string;
};

/** Detail for `tool_result` phase */
export type SubagentProgressDetailToolResult = {
  toolName: string;
  success: boolean;
  durationMs?: number;
  outputPreview?: string;
};

/** Detail for `error` phase */
export type SubagentProgressDetailError = {
  errorCode?: string;
  errorMessage: string;
  recoverable: boolean;
};

/** Detail for `completed` phase */
export type SubagentProgressDetailCompleted = {
  outcome: "ok" | "error" | "timeout";
  totalDurationMs: number;
  resultPreview?: string;
};

// ─── Emit ───────────────────────────────────────────────────────────

/**
 * Emit a sub-agent progress event on the agent-events bus.
 * This is the primary interface for the agent engine to report progress.
 *
 * Best-effort: if the agent-events system is unavailable (e.g. during tests
 * with mocked dependencies), the emit is silently skipped.
 */
export function emitSubagentProgress(event: {
  runId: string;
  phase: SubagentProgressPhase;
  message: string;
  detail?: Record<string, unknown>;
  sessionKey?: string;
  parentSessionKey?: string;
  label?: string;
}): void {
  try {
    emitAgentEvent({
      runId: event.runId,
      stream: SUBAGENT_PROGRESS_STREAM,
      sessionKey: event.sessionKey ?? event.parentSessionKey,
      data: {
        phase: event.phase,
        message: event.message,
        detail: event.detail,
        parentSessionKey: event.parentSessionKey,
        label: event.label,
      },
    });
  } catch {
    // Best-effort: tests may mock agent-events without providing emitAgentEvent.
    // Progress events are purely observational and must never break core flows.
  }
}

// ─── Subscribe ──────────────────────────────────────────────────────

/**
 * Subscribe to all sub-agent progress events.
 * Returns an unsubscribe function.
 */
export function onSubagentProgress(
  handler: (event: SubagentProgressEvent) => void,
): () => void {
  return onAgentEvent((raw: AgentEventPayload) => {
    if (raw.stream !== SUBAGENT_PROGRESS_STREAM) {
      return;
    }
    const data = raw.data ?? {};
    const event: SubagentProgressEvent = {
      runId: raw.runId,
      phase: (data.phase as SubagentProgressPhase) ?? "unknown",
      message: (data.message as string) ?? "",
      detail: data.detail as Record<string, unknown> | undefined,
      seq: raw.seq,
      ts: raw.ts,
      sessionKey: raw.sessionKey,
      parentSessionKey: data.parentSessionKey as string | undefined,
      label: data.label as string | undefined,
    };
    handler(event);
  });
}

/**
 * Subscribe to progress events for a specific run.
 * Returns an unsubscribe function.
 */
export function onSubagentRunProgress(
  runId: string,
  handler: (event: SubagentProgressEvent) => void,
): () => void {
  return onSubagentProgress((event) => {
    if (event.runId === runId) {
      handler(event);
    }
  });
}

// ─── Aggregate Snapshot (for parallel display) ──────────────────────

/**
 * A snapshot of all active sub-agent runs and their latest progress.
 * Used by UI layers to render a parallel progress dashboard.
 */
export type SubagentProgressSnapshot = {
  /** Timestamp of this snapshot */
  ts: number;
  /** Active runs keyed by runId */
  runs: Map<
    string,
    {
      runId: string;
      phase: SubagentProgressPhase;
      message: string;
      detail?: Record<string, unknown>;
      label?: string;
      parentSessionKey?: string;
      sessionKey?: string;
      lastUpdateTs: number;
      startedTs: number;
    }
  >;
};

// ─── Progress Tracker ───────────────────────────────────────────────

/**
 * Creates a progress tracker that maintains a rolling snapshot of all
 * active sub-agent runs. This is the recommended interface for UI layers
 * that need to display parallel progress.
 *
 * ```ts
 * const tracker = createSubagentProgressTracker();
 * // Later, to get current state:
 * const snapshot = tracker.getSnapshot();
 * for (const [runId, run] of snapshot.runs) {
 *   console.log(`[${run.label ?? runId}] ${run.phase}: ${run.message}`);
 * }
 * // When done:
 * tracker.dispose();
 * ```
 */
export function createSubagentProgressTracker(): {
  /** Get a snapshot of all active sub-agent runs and their latest progress */
  getSnapshot: () => SubagentProgressSnapshot;
  /** Stop tracking and release all resources */
  dispose: () => void;
} {
  const activeRuns = new Map<
    string,
    {
      phase: SubagentProgressPhase;
      message: string;
      detail?: Record<string, unknown>;
      label?: string;
      parentSessionKey?: string;
      sessionKey?: string;
      lastUpdateTs: number;
      startedTs: number;
    }
  >();

  const TERMINAL_PHASES = new Set<SubagentProgressPhase>([
    SUBAGENT_PROGRESS_PHASE_COMPLETED,
    SUBAGENT_PROGRESS_PHASE_KILLED,
    SUBAGENT_PROGRESS_PHASE_TIMEOUT,
  ]);

  const unsubscribe = onSubagentProgress((event) => {
    const existing = activeRuns.get(event.runId);
    if (TERMINAL_PHASES.has(event.phase)) {
      // Terminal phase: keep in map briefly for UI to render final state,
      // then remove after a short delay
      activeRuns.set(event.runId, {
        phase: event.phase,
        message: event.message,
        detail: event.detail,
        label: event.label,
        parentSessionKey: event.parentSessionKey,
        sessionKey: event.sessionKey,
        lastUpdateTs: event.ts,
        startedTs: existing?.startedTs ?? event.ts,
      });
      setTimeout(() => {
        activeRuns.delete(event.runId);
      }, 30_000); // keep terminal state visible for 30s
      return;
    }

    activeRuns.set(event.runId, {
      phase: event.phase,
      message: event.message,
      detail: event.detail,
      label: event.label,
      parentSessionKey: event.parentSessionKey,
      sessionKey: event.sessionKey,
      lastUpdateTs: event.ts,
      startedTs: existing?.startedTs ?? event.ts,
    });
  });

  return {
    getSnapshot: () => ({
      ts: Date.now(),
      runs: new Map(activeRuns),
    }),
    dispose: () => {
      unsubscribe();
      activeRuns.clear();
    },
  };
}
