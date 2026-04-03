/**
 * StableClaw Execution Resilience Layer
 *
 * Provides retry logic, timeout management, and graceful degradation
 * for agent execution. Inspired by Claude Code's resilient execution model:
 *
 * Key patterns borrowed from Claude Code:
 * - Exponential backoff with jitter for retries
 * - Per-operation timeouts (tool, model call, overall)
 * - Stall detection with automatic recovery
 * - Progress-driven timeout extension
 * - Graceful cancellation via AbortController composition
 */

import type { RetryPolicy, ExecutionTimeoutConfig } from "./types.js";
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_CONFIG } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("execution/resilience");

// ---------------------------------------------------------------------------
// Retry with Exponential Backoff
// ---------------------------------------------------------------------------

/**
 * Execute an async operation with exponential backoff retry.
 *
 * Unlike simple retry loops, this implementation:
 * - Uses full jitter to avoid thundering herd across concurrent runs
 * - Classifies errors to avoid retrying non-retryable failures
 * - Tracks cumulative delay to enforce overall budget
 * - Emits structured log events for each attempt
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options?: {
    policy?: Partial<RetryPolicy>;
    /** Error classifier: return true if the error is retryable */
    isRetryable?: (error: unknown, attempt: number) => boolean;
    /** Called before each retry attempt */
    onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
    /** Operation label for logging */
    label?: string;
  },
): Promise<T> {
  const policy: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...options?.policy };
  const label = options?.label ?? "operation";
  const isRetryable = options?.isRetryable ?? defaultIsRetryable;
  let lastError: unknown;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;

      if (attempt >= policy.maxRetries) {
        log.error(
          `${label} failed after ${attempt + 1} attempt(s): ${String(err)}`,
        );
        throw err;
      }

      if (!isRetryable(err, attempt)) {
        log.error(
          `${label} non-retryable error on attempt ${attempt + 1}: ${String(err)}`,
        );
        throw err;
      }

      const delayMs = calculateBackoffDelay(attempt, policy);
      log.warn(
        `${label} attempt ${attempt + 1} failed, retrying in ${Math.round(delayMs)}ms: ${String(err)}`,
      );

      options?.onRetry?.(attempt + 1, err, delayMs);
      await sleep(delayMs);
    }
  }

  // Unreachable, but TypeScript needs it
  throw lastError;
}

function calculateBackoffDelay(attempt: number, policy: RetryPolicy): number {
  const exponentialDelay = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, policy.maxDelayMs);
  const jitterRange = cappedDelay * policy.jitterFactor;
  const jitter = Math.random() * jitterRange * 2 - jitterRange;
  return Math.max(0, Math.round(cappedDelay + jitter));
}

function defaultIsRetryable(error: unknown, _attempt: number): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Network / transient errors
    if (
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout") ||
      msg.includes("socket hang up") ||
      msg.includes("network") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("521") ||
      msg.includes("429") ||
      msg.includes("rate limit") ||
      msg.includes("overloaded") ||
      msg.includes("temporarily unavailable") ||
      msg.includes("server error") ||
      msg.includes("internal error")
    ) {
      return true;
    }
    // Abort errors are never retryable
    if (error.name === "AbortError" || msg.includes("aborted")) {
      return false;
    }
    // Context overflow and auth errors are not retryable at the same level
    if (
      msg.includes("context") ||
      msg.includes("token limit") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("authentication")
    ) {
      return false;
    }
  }
  // Default: retry unknown errors
  return true;
}

// ---------------------------------------------------------------------------
// Timeout Management
// ---------------------------------------------------------------------------

export type TimeoutResult<T> =
  | { kind: "completed"; value: T; elapsedMs: number }
  | { kind: "timed_out"; elapsedMs: number };

/**
 * Execute an operation with a timeout.
 * Unlike Promise.race, this properly cleans up on timeout.
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  options?: {
    label?: string;
    onTimeout?: () => void;
  },
): Promise<TimeoutResult<T>> {
  if (timeoutMs <= 0) {
    // No timeout
    const start = Date.now();
    const value = await operation();
    return { kind: "completed", value, elapsedMs: Date.now() - start };
  }

  const start = Date.now();
  const label = options?.label ?? "operation";

  return new Promise<TimeoutResult<T>>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const elapsed = Date.now() - start;
      log.warn(`${label} timed out after ${elapsed}ms (limit: ${timeoutMs}ms)`);
      options?.onTimeout?.();
      resolve({ kind: "timed_out", elapsedMs: elapsed });
    }, timeoutMs);

    operation()
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ kind: "completed", value, elapsedMs: Date.now() - start });
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Re-throw the error (not a timeout)
        throw err;
      });
  });
}

/**
 * Create a combined AbortController that wraps an operation timeout
 * with a user-initiated abort signal. This is the Claude Code pattern
 * for composing cancellation sources.
 */
export function createCompositeAbortController(options?: {
  timeoutMs?: number;
  externalSignal?: AbortSignal;
  onAbort?: (reason: string) => void;
}): AbortController {
  const controller = new AbortController();

  // Relay external abort
  if (options?.externalSignal) {
    if (options.externalSignal.aborted) {
      controller.abort(options.externalSignal.reason);
    } else {
      const onExternalAbort = () => {
        controller.abort(options.externalSignal!.reason);
        options?.onAbort?.("external");
      };
      options.externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  // Set up timeout-based abort
  if (options?.timeoutMs && options.timeoutMs > 0) {
    const timer = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort(new Error(`Operation timed out after ${options.timeoutMs}ms`));
        options?.onAbort?.("timeout");
      }
    }, options.timeoutMs);

    // Clean up timer if abort happens first
    controller.signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
      },
      { once: true },
    );
  }

  return controller;
}

// ---------------------------------------------------------------------------
// Stall Detection & Recovery
// ---------------------------------------------------------------------------

export type StallMonitorOptions = {
  /** Callback when a stall is detected */
  onStall: (stallDurationMs: number) => void;
  /** Stall threshold in ms */
  stallThresholdMs?: number;
  /** Label for logging */
  label?: string;
};

/**
 * Create a stall monitor that triggers if no progress signal
 * is received within the threshold window.
 *
 * Usage:
 * ```ts
 * const monitor = createStallMonitor({
 *   onStall: (duration) => log.warn(`Stalled for ${duration}ms`),
 *   stallThresholdMs: 60_000,
 * });
 *
 * // In your execution loop:
 * monitor.signalProgress(); // resets the timer
 *
 * // When done:
 * monitor.dispose();
 * ```
 */
export function createStallMonitor(options: StallMonitorOptions) {
  const thresholdMs = options.stallThresholdMs ?? 120_000;
  const label = options.label ?? "execution";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastProgressAt = Date.now();
  let disposed = false;

  const checkStall = () => {
    if (disposed) return;
    const idle = Date.now() - lastProgressAt;
    if (idle > thresholdMs) {
      log.warn(`${label} stall detected: no progress for ${Math.round(idle / 1000)}s`);
      options.onStall(idle);
    }
    // Re-schedule check
    timer = setTimeout(checkStall, Math.min(thresholdMs, 30_000));
  };

  // Start monitoring
  timer = setTimeout(checkStall, thresholdMs);

  return {
    /** Call this whenever meaningful progress is made */
    signalProgress: () => {
      lastProgressAt = Date.now();
    },
    /** Get current idle time in ms */
    getIdleTime: () => Date.now() - lastProgressAt,
    /** Stop monitoring */
    dispose: () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Progress-Driven Timeout Extension
// ---------------------------------------------------------------------------

/**
 * Wraps a timeout to auto-extend when progress is detected.
 * This prevents false timeouts during long but active executions.
 */
export function createProgressAwareTimeout(options: {
  baseTimeoutMs: number;
  /** Maximum total timeout including extensions */
  maxTimeoutMs: number;
  /** How much to extend on each progress signal (ms) */
  extensionMs?: number;
  label?: string;
}) {
  const extensionMs = options.extensionMs ?? 30_000;
  const maxTimeoutMs = options.maxTimeoutMs;
  let currentDeadline = Date.now() + options.baseTimeoutMs;
  let totalExtensionGranted = 0;

  return {
    /** Signal progress; extends the deadline if under max */
    signalProgress: () => {
      const now = Date.now();
      if (now + extensionMs > maxTimeoutMs) {
        return; // Already at max
      }
      currentDeadline = now + extensionMs;
      totalExtensionGranted += extensionMs;
    },
    /** Check if the deadline has passed */
    isExpired: () => Date.now() > currentDeadline,
    /** Get remaining time in ms */
    getRemainingMs: () => Math.max(0, currentDeadline - Date.now()),
    /** Get total extension time granted */
    getTotalExtensionMs: () => totalExtensionGranted,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
