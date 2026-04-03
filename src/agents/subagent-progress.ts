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

// ─── Failure Recovery Interface ────────────────────────────────────

/**
 * A failure recovery request that can be presented to the user.
 *
 * When a sub-agent fails (timeout, error, killed), the system creates
 * a recovery request that UI layers can use to prompt the user for
 * input. The user's response is then forwarded to resume the agent.
 */
export type SubagentFailureRecoveryRequest = {
  /** Unique identifier for this recovery request */
  recoveryId: string;
  /** The runId of the failed sub-agent */
  runId: string;
  /** Session key of the failed sub-agent */
  sessionKey?: string;
  /** Parent agent's session key */
  parentSessionKey?: string;
  /** What happened: "timeout" | "error" | "killed" */
  failureReason: string;
  /** Human-readable description of what failed */
  description: string;
  /** The original task that was being executed */
  task?: string;
  /** Label/tag for the sub-agent */
  label?: string;
  /** When the failure occurred (epoch ms) */
  failedAt: number;
  /** How long the agent ran before failing (ms) */
  durationMs?: number;
  /** Error details (for error failures) */
  errorDetail?: string;
};

/**
 * Callback type for handling user recovery input.
 *
 * UI layers register this callback to receive the user's text input
 * when they choose to resume a failed agent. The callback should
 * forward the input to the appropriate session/agent for continuation.
 *
 * @param recoveryId - The recovery request ID
 * @param userInput - The user's text input for continuing the task
 * @returns Promise that resolves when the input has been delivered
 */
export type SubagentRecoveryHandler = (
  recoveryId: string,
  userInput: string,
) => Promise<void>;

/**
 * Callback type for handling failure recovery requests.
 *
 * When a sub-agent fails, this callback is invoked with the recovery
 * request. The UI layer should present the user with an input prompt
 * (e.g., a text box) showing the failure context and allowing them
 * to type a continuation message.
 *
 * @param request - The failure recovery request
 */
export type SubagentFailureHandler = (request: SubagentFailureRecoveryRequest) => void;

// ─── Recovery Registry ─────────────────────────────────────────────

let activeFailureHandler: SubagentFailureHandler | null = null;
let activeRecoveryHandler: SubagentRecoveryHandler | null = null;
const pendingRecoveryRequests = new Map<string, SubagentFailureRecoveryRequest>();

/**
 * Register a handler that will be called when a sub-agent fails.
 *
 * The UI layer calls this to receive failure notifications and
 * present the user with an input prompt for recovery.
 *
 * ```ts
 * import { onSubagentFailure, submitRecoveryInput } from "./subagent-progress.js";
 *
 * // Register to receive failure events
 * onSubagentFailure((request) => {
 *   // Show user a prompt:
 *   // "Agent '[label]' failed: [description]. Type a message to continue:"
 *   showInputPrompt(request);
 * });
 *
 * // When user types and submits:
 * async function handleUserInput(recoveryId: string, text: string) {
 *   await submitRecoveryInput(recoveryId, text);
 * }
 * ```
 *
 * @param handler - Callback invoked on sub-agent failure
 */
export function onSubagentFailure(handler: SubagentFailureHandler): () => void {
  activeFailureHandler = handler;
  return () => {
    if (activeFailureHandler === handler) {
      activeFailureHandler = null;
    }
  };
}

/**
 * Register a handler that processes user recovery input.
 *
 * The gateway or channel layer implements this to deliver the user's
 * input to the appropriate agent session for continuation.
 *
 * ```ts
 * import { setRecoveryHandler } from "./subagent-progress.js";
 *
 * setRecoveryHandler(async (recoveryId, userInput) => {
 *   const request = getPendingRecoveryRequest(recoveryId);
 *   if (!request) return;
 *   // Deliver userInput to the parent session via gateway
 *   await callGateway({
 *     method: "agent",
 *     params: {
 *       sessionKey: request.parentSessionKey,
 *       message: `[Recovery from failure] ${userInput}`,
 *       deliver: true,
 *     },
 *   });
 * });
 * ```
 *
 * @param handler - Callback invoked with user's recovery input
 */
export function setRecoveryHandler(handler: SubagentRecoveryHandler): () => void {
  activeRecoveryHandler = handler;
  return () => {
    if (activeRecoveryHandler === handler) {
      activeRecoveryHandler = null;
    }
  };
}

/**
 * Submit user recovery input for a failed sub-agent.
 *
 * Called by the UI layer when the user provides input to continue
 * after a failure. The input is forwarded to the registered
 * recovery handler (set via `setRecoveryHandler`).
 *
 * @param recoveryId - The recovery request ID
 * @param userInput - The user's text input for continuing
 * @returns true if a handler was registered and called, false otherwise
 */
export async function submitRecoveryInput(
  recoveryId: string,
  userInput: string,
): Promise<boolean> {
  if (!activeRecoveryHandler) {
    return false;
  }
  try {
    await activeRecoveryHandler(recoveryId, userInput);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a pending recovery request by ID.
 *
 * @param recoveryId - The recovery request ID
 * @returns The recovery request if still pending, undefined if already handled
 */
export function getPendingRecoveryRequest(
  recoveryId: string,
): SubagentFailureRecoveryRequest | undefined {
  return pendingRecoveryRequests.get(recoveryId);
}

/**
 * Get all pending recovery requests.
 * Useful for UI initialization to show existing failed tasks.
 */
export function getAllPendingRecoveryRequests(): SubagentFailureRecoveryRequest[] {
  return [...pendingRecoveryRequests.values()];
}

/**
 * Clear a pending recovery request after it has been handled.
 */
export function clearPendingRecoveryRequest(recoveryId: string): void {
  pendingRecoveryRequests.delete(recoveryId);
}

/**
 * Emit a failure recovery event. Called by the agent engine when
 * a sub-agent fails in a way that the user might want to recover from.
 *
 * This creates a recovery request and invokes the registered failure
 * handler. The handler (typically a UI layer) should present the user
 * with an input prompt showing the failure context.
 *
 * The recovery request is stored in `pendingRecoveryRequests` until
 * the user responds or it is explicitly cleared.
 */
export function emitSubagentFailureRecovery(params: {
  runId: string;
  sessionKey?: string;
  parentSessionKey?: string;
  failureReason: "timeout" | "error" | "killed";
  description: string;
  task?: string;
  label?: string;
  durationMs?: number;
  errorDetail?: string;
}): string {
  const recoveryId = `recovery:${params.runId}:${Date.now()}`;
  const request: SubagentFailureRecoveryRequest = {
    recoveryId,
    runId: params.runId,
    sessionKey: params.sessionKey,
    parentSessionKey: params.parentSessionKey,
    failureReason: params.failureReason,
    description: params.description,
    task: params.task,
    label: params.label,
    failedAt: Date.now(),
    durationMs: params.durationMs,
    errorDetail: params.errorDetail,
  };
  pendingRecoveryRequests.set(recoveryId, request);

  // Invoke the failure handler if one is registered
  if (activeFailureHandler) {
    try {
      activeFailureHandler(request);
    } catch {
      // Handler errors should not propagate
    }
  }

  return recoveryId;
}
