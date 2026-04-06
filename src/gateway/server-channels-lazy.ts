/**
 * Lazy + Parallel Channel Manager
 *
 * Provides higher-level channel startup semantics on top of the core
 * {@link ChannelManager}:
 *
 * - **Parallel start** – all channels boot concurrently via `Promise.allSettled`
 *   instead of sequentially, so one slow channel doesn't block others.
 * - **Critical-first start** – important channels (whatsapp, telegram) start
 *   immediately while non-essential channels are deferred by a configurable delay.
 * - **Timeout protection** – each channel start is wrapped with a timeout so a
 *   stuck channel doesn't prevent the gateway from becoming ready.
 * - **On-demand activation** – deferred channels can be started later via
 *   `startChannelOnDemand()`.
 * - **State tracking** – real-time per-channel state for health endpoints.
 *
 * Usage:
 *   const results = await startChannelsParallel({ channelManager });
 *   // or
 *   await startCriticalChannelsFirst({ channelManager, cfg });
 *   // later
 *   await startChannelOnDemand("discord");
 */

import { listChannelPlugins } from "../channels/plugins/index.js";
import type { ChannelId } from "../channels/plugins/types.js";
import { CHAT_CHANNEL_ORDER } from "../channels/ids.js";
import type { ChannelManager, ChannelStartResult } from "./server-channels.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("gateway/channels-lazy");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-channel state tracked by the lazy manager. */
export type ChannelState = {
  id: string;
  state: "pending" | "starting" | "ready" | "failed" | "stopped";
  error?: Error;
  startTimeMs?: number;
  deferred?: boolean;
};

/** Options for parallel channel startup. */
export type StartChannelsParallelOptions = {
  /** The core channel manager created by `createChannelManager()`. */
  channelManager: ChannelManager;
  /**
   * Per-channel timeout in milliseconds. If a channel takes longer than this
   * it is marked as failed but the other channels are unaffected.
   * @default 30_000 (30 seconds)
   */
  timeoutMs?: number;
};

/** Options for critical-first channel startup. */
export type StartCriticalChannelsFirstOptions = {
  /** The core channel manager. */
  channelManager: ChannelManager;
  /**
   * Gateway config used to determine which channels are configured/enabled.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cfg: any;
  /**
   * Delay in ms before starting non-critical channels.
   * @default 3_000 (3 seconds)
   */
  deferNonCriticalMs?: number;
  /**
   * Per-channel timeout in milliseconds.
   * @default 30_000
   */
  timeoutMs?: number;
};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Set of channels considered "critical" — started immediately. */
const CRITICAL_CHANNEL_IDS = new Set<string>([
  "telegram",
  "whatsapp",
  "discord",
  "slack",
]);

/** Current state of every known channel. */
const channelStates = new Map<string, ChannelState>();

/** Timeout handles for deferred channel starts (for cleanup). */
const deferredTimers = new Set<ReturnType<typeof setTimeout>>();

/** The channel manager instance (set once via any start function). */
let activeChannelManager: ChannelManager | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wrap an async operation with a timeout. Rejects with a TimeoutError if the
 * operation doesn't settle within `timeoutMs`.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    // Prevent the timer from keeping the process alive.
    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Initialise channel state tracking for all registered plugins.
 */
function initChannelStates(): void {
  const plugins = listChannelPlugins();
  for (const plugin of plugins) {
    if (!channelStates.has(plugin.id)) {
      channelStates.set(plugin.id, {
        id: plugin.id,
        state: "pending",
      });
    }
  }
}

/**
 * Classify a channel as critical or non-critical.
 *
 * Critical channels are those explicitly listed in `CRITICAL_CHANNEL_IDS`
 * OR channels that appear early in `CHAT_CHANNEL_ORDER` (index < 3).
 * All other channels are non-critical.
 */
function isCriticalChannel(channelId: string): boolean {
  if (CRITICAL_CHANNEL_IDS.has(channelId)) {
    return true;
  }
  const orderIndex = CHAT_CHANNEL_ORDER.indexOf(channelId as (typeof CHAT_CHANNEL_ORDER)[number]);
  return orderIndex >= 0 && orderIndex < 3;
}

/**
 * Partition registered channel plugins into critical and non-critical lists.
 */
function partitionChannels(): { critical: ChannelId[]; nonCritical: ChannelId[] } {
  const plugins = listChannelPlugins();
  const critical: ChannelId[] = [];
  const nonCritical: ChannelId[] = [];
  for (const plugin of plugins) {
    if (isCriticalChannel(plugin.id)) {
      critical.push(plugin.id);
    } else {
      nonCritical.push(plugin.id);
    }
  }
  return { critical, nonCritical };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start all channels in parallel instead of sequentially.
 *
 * This is the primary optimization over `channelManager.startChannels()`:
 * every channel is started concurrently via `Promise.allSettled`, so one
 * slow channel (e.g. a WebSocket reconnect loop) does not block others.
 *
 * Each channel is wrapped with a timeout (default 30s) to prevent indefinite
 * blocking. Results are returned for observability.
 */
export async function startChannelsParallel(
  params: StartChannelsParallelOptions,
): Promise<Map<string, ChannelStartResult>> {
  const { channelManager, timeoutMs = 30_000 } = params;
  activeChannelManager = channelManager;

  initChannelStates();

  const plugins = listChannelPlugins();
  if (plugins.length === 0) {
    log.info("no channel plugins registered — nothing to start");
    return new Map();
  }

  log.info(`starting ${plugins.length} channel(s) in parallel (timeout: ${timeoutMs}ms)`);

  // Mark all as starting
  for (const plugin of plugins) {
    const state = channelStates.get(plugin.id);
    if (state) {
      state.state = "starting";
    }
  }

  const overallStart = performance.now();

  // Use Promise.allSettled with per-channel timeout wrappers.
  const settled = await Promise.allSettled(
    plugins.map(async (plugin) => {
      const channelStart = performance.now();
      const label = `channel:${plugin.id}`;

      try {
        await withTimeout(channelManager.startChannel(plugin.id), timeoutMs, label);

        const startTimeMs = performance.now() - channelStart;
        const state = channelStates.get(plugin.id);
        if (state) {
          state.state = "ready";
          state.startTimeMs = startTimeMs;
        }

        log.debug(`channel ${plugin.id} started in ${startTimeMs.toFixed(0)}ms`);

        return {
          channelId: plugin.id,
          started: true,
          startTimeMs,
        } satisfies ChannelStartResult;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const startTimeMs = performance.now() - channelStart;
        const state = channelStates.get(plugin.id);
        if (state) {
          state.state = "failed";
          state.error = error;
          state.startTimeMs = startTimeMs;
        }

        log.warn(`channel ${plugin.id} failed after ${startTimeMs.toFixed(0)}ms: ${error.message}`);

        return {
          channelId: plugin.id,
          started: false,
          error,
          startTimeMs,
        } satisfies ChannelStartResult;
      }
    }),
  );

  // Collect results
  const results = new Map<string, ChannelStartResult>();
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]!;
    const result =
      outcome.status === "fulfilled"
        ? outcome.value
        : {
            channelId: plugins[i]!.id,
            started: false,
            error:
              outcome.reason instanceof Error
                ? outcome.reason
                : new Error(String(outcome.reason)),
            startTimeMs: 0,
          };
    results.set(result.channelId, result);
  }

  const totalMs = performance.now() - overallStart;
  const succeeded = [...results.values()].filter((r) => r.started).length;
  const failed = results.size - succeeded;

  log.info(
    `parallel channel startup complete in ${totalMs.toFixed(0)}ms` +
      ` (${succeeded} succeeded, ${failed} failed)`,
  );

  return results;
}

/**
 * Start only critical channels immediately; defer non-critical channels.
 *
 * "Critical" channels (telegram, whatsapp, discord, slack, and any channel
 * with `CHAT_CHANNEL_ORDER` index < 3) are started in parallel right away.
 * Non-critical channels are scheduled to start after a configurable delay
 * (default 3s) so the gateway can begin serving traffic on the important
 * channels as quickly as possible.
 *
 * Returns results for the critical channels that were started immediately.
 */
export async function startCriticalChannelsFirst(
  params: StartCriticalChannelsFirstOptions,
): Promise<Map<string, ChannelStartResult>> {
  const {
    channelManager,
    deferNonCriticalMs = 3_000,
    timeoutMs = 30_000,
  } = params;
  activeChannelManager = channelManager;

  initChannelStates();

  const { critical, nonCritical } = partitionChannels();

  if (critical.length === 0 && nonCritical.length === 0) {
    log.info("no channel plugins registered — nothing to start");
    return new Map();
  }

  log.info(
    `starting ${critical.length} critical channel(s) immediately,` +
      ` deferring ${nonCritical.length} non-critical channel(s) for ${deferNonCriticalMs}ms`,
  );

  // Mark critical as starting, non-critical as pending/deferred
  for (const id of critical) {
    const state = channelStates.get(id);
    if (state) {
      state.state = "starting";
    }
  }
  for (const id of nonCritical) {
    const state = channelStates.get(id);
    if (state) {
      state.state = "pending";
      state.deferred = true;
    }
  }

  // Start critical channels in parallel.
  const criticalResults = await startChannelsParallel({
    channelManager,
    timeoutMs,
  });

  // Schedule non-critical channels to start after a delay.
  if (nonCritical.length > 0) {
    const timer = setTimeout(() => {
      deferredTimers.delete(timer);
      log.info(`starting ${nonCritical.length} deferred channel(s)...`);
      // Use fire-and-forget — errors are already logged inside startChannelsParallel.
      void startDeferredChannels(nonCritical, timeoutMs);
    }, deferNonCriticalMs);
    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }
    deferredTimers.add(timer);
  }

  // Filter critical results from the full parallel results
  const criticalOnly = new Map<string, ChannelStartResult>();
  for (const [id, result] of criticalResults) {
    if (critical.includes(id as ChannelId)) {
      criticalOnly.set(id, result);
    }
  }

  return criticalOnly;
}

/**
 * Start a specific channel by ID on-demand.
 *
 * Used when a deferred channel needs to be activated before its scheduled
 * delay (e.g. when a client sends a message that targets a deferred channel).
 */
export async function startChannelOnDemand(
  channelId: string,
  opts?: { timeoutMs?: number },
): Promise<ChannelStartResult> {
  const manager = activeChannelManager;
  if (!manager) {
    return {
      channelId,
      started: false,
      error: new Error("no channel manager registered — call startChannelsParallel or startCriticalChannelsFirst first"),
      startTimeMs: 0,
    };
  }

  const state = channelStates.get(channelId);
  if (state?.state === "ready") {
    return { channelId, started: true, startTimeMs: 0 };
  }
  if (state?.state === "starting") {
    // Already starting — wait and return when done.
    return waitForChannelReady(channelId, opts?.timeoutMs ?? 30_000);
  }

  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const label = `channel:${channelId}(on-demand)`;

  if (state) {
    state.state = "starting";
    state.deferred = false;
  }

  const startTime = performance.now();
  try {
    await withTimeout(manager.startChannel(channelId as ChannelId), timeoutMs, label);
    const startTimeMs = performance.now() - startTime;
    if (state) {
      state.state = "ready";
      state.startTimeMs = startTimeMs;
    }
    log.info(`on-demand start: channel ${channelId} ready in ${startTimeMs.toFixed(0)}ms`);
    return { channelId, started: true, startTimeMs };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const startTimeMs = performance.now() - startTime;
    if (state) {
      state.state = "failed";
      state.error = error;
      state.startTimeMs = startTimeMs;
    }
    log.warn(`on-demand start: channel ${channelId} failed: ${error.message}`);
    return { channelId, started: false, error, startTimeMs };
  }
}

/**
 * Get the current state of all known channels.
 *
 * This is a point-in-time snapshot suitable for health endpoints and
 * status pages.
 */
export function getChannelStates(): Map<string, ChannelState> {
  return new Map(channelStates);
}

/**
 * Get the state of a single channel.
 */
export function getChannelState(channelId: string): ChannelState | undefined {
  return channelStates.get(channelId);
}

/**
 * Check whether all channels are ready (or failed — no longer pending/starting).
 */
export function areAllChannelsSettled(): boolean {
  for (const state of channelStates.values()) {
    if (state.state === "pending" || state.state === "starting") {
      return false;
    }
  }
  return channelStates.size > 0;
}

/**
 * Cancel all pending deferred channel starts.
 *
 * Call this during graceful shutdown to prevent channels from starting
 * after the shutdown process has begun.
 */
export function cancelDeferredStarts(): void {
  for (const timer of deferredTimers) {
    clearTimeout(timer);
  }
  deferredTimers.clear();
  for (const state of channelStates.values()) {
    if (state.state === "pending" && state.deferred) {
      state.state = "stopped";
    }
  }
}

/**
 * Reset all internal state. Intended for tests only.
 */
export function resetChannelLazyState(): void {
  cancelDeferredStarts();
  channelStates.clear();
  activeChannelManager = null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Wait for a channel that is currently starting to become ready or failed.
 */
function waitForChannelReady(channelId: string, timeoutMs: number): Promise<ChannelStartResult> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const deadline = startTime + timeoutMs;
    const check = () => {
      const state = channelStates.get(channelId);
      if (state?.state === "ready") {
        resolve({
          channelId,
          started: true,
          startTimeMs: performance.now() - startTime,
        });
        return;
      }
      if (state?.state === "failed") {
        resolve({
          channelId,
          started: false,
          error: state.error,
          startTimeMs: performance.now() - startTime,
        });
        return;
      }
      if (Date.now() > deadline) {
        resolve({
          channelId,
          started: false,
          error: new Error(`timed out waiting for channel ${channelId} to settle`),
          startTimeMs: performance.now() - startTime,
        });
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

/**
 * Start a set of deferred channels (fire-and-forget with logging).
 */
async function startDeferredChannels(channelIds: ChannelId[], timeoutMs: number): Promise<void> {
  const manager = activeChannelManager;
  if (!manager) {
    log.warn("cannot start deferred channels: no channel manager registered");
    return;
  }

  const settled = await Promise.allSettled(
    channelIds.map(async (channelId) => {
      const state = channelStates.get(channelId);
      if (state?.state === "ready" || state?.state === "starting") {
        return; // Already started or starting
      }
      if (state) {
        state.state = "starting";
        state.deferred = false;
      }

      const startTime = performance.now();
      try {
        await withTimeout(manager.startChannel(channelId), timeoutMs, `channel:${channelId}(deferred)`);
        const startTimeMs = performance.now() - startTime;
        if (state) {
          state.state = "ready";
          state.startTimeMs = startTimeMs;
        }
        log.info(`deferred channel ${channelId} started in ${startTimeMs.toFixed(0)}ms`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const startTimeMs = performance.now() - startTime;
        if (state) {
          state.state = "failed";
          state.error = error;
          state.startTimeMs = startTimeMs;
        }
        log.warn(`deferred channel ${channelId} failed after ${startTimeMs.toFixed(0)}ms: ${error.message}`);
      }
    }),
  );

  const failed = settled.filter((s) => s.status === "rejected").length;
  if (failed > 0) {
    log.warn(`${failed} deferred channel(s) failed to start`);
  }
}
