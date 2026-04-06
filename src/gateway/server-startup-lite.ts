/**
 * Lightweight Sidecar Startup (server-startup-lite.ts)
 *
 * A streamlined version of `server-startup.ts` that replaces the heavy
 * sequential `startGatewaySidecars()` with parallel initialization.
 *
 * Key optimizations over the original:
 * 1. Channels start in **parallel** (via `startChannelsParallel`) instead
 *    of sequentially via `for...of` + `await`.
 * 2. Gmail watcher, internal hooks, model prewarm, and channel startup all
 *    run concurrently via `Promise.allSettled` instead of blocking each other.
 * 3. Non-essential services (plugin services, memory backend) run in the
 *    background and don't block the startup return.
 * 4. ACP reconcile and restart sentinel are already fire-and-forget.
 *
 * Usage (drop-in replacement for `startGatewaySidecars`):
 *   const { pluginServices } = await startGatewaySidecarsLite({
 *     cfg, pluginRegistry, defaultWorkspaceDir, deps,
 *     startChannels: channelManager.startChannelsParallel,
 *     log, logHooks, logChannels,
 *   });
 */

import { getAcpSessionManager } from "../acp/control-plane/manager.js";
import { ACP_SESSION_IDENTITY_RENDERER_VERSION } from "../acp/runtime/session-identifiers.js";
import { resolveOpenClawAgentDir } from "../agents/agent-paths.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import {
  getModelRefStatus,
  resolveConfiguredModelRef,
  resolveHooksGmailModel,
} from "../agents/model-selection.js";
import { ensureOpenClawModelsJson } from "../agents/models-config.js";
import { resolveModel } from "../agents/pi-embedded-runner/model.js";
import { resolveAgentSessionDirs } from "../agents/session-dirs.js";
import { cleanStaleLockFiles } from "../agents/session-write-lock.js";
import type { CliDeps } from "../cli/deps.js";
import type { loadConfig } from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import { resolveStateDir } from "../config/paths.js";
import { startGmailWatcherWithLogs } from "../hooks/gmail-watcher-lifecycle.js";
import {
  clearInternalHooks,
  createInternalHookEvent,
  triggerInternalHook,
} from "../hooks/internal-hooks.js";
import { loadInternalHooks } from "../hooks/loader.js";
import { isTruthyEnvValue } from "../infra/env.js";
import type { loadOpenClawPlugins } from "../plugins/loader.js";
import { type PluginServicesHandle, startPluginServices } from "../plugins/services.js";
import {
  scheduleRestartSentinelWake,
  shouldWakeFromRestartSentinel,
} from "./server-restart-sentinel.js";
import { startGatewayMemoryBackend } from "./server-startup-memory.js";

const SESSION_LOCK_STALE_MS = 30 * 60 * 1000;

/**
 * Validate and warm the configured primary model (same logic as original).
 */
async function prewarmConfiguredPrimaryModel(params: {
  cfg: ReturnType<typeof loadConfig>;
  log: { warn: (msg: string) => void };
}): Promise<void> {
  const explicitPrimary = resolveAgentModelPrimaryValue(params.cfg.agents?.defaults?.model)?.trim();
  if (!explicitPrimary) {
    return;
  }
  const { provider, model } = resolveConfiguredModelRef({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  const agentDir = resolveOpenClawAgentDir();
  try {
    await ensureOpenClawModelsJson(params.cfg, agentDir);
    const resolved = resolveModel(provider, model, agentDir, params.cfg, {
      skipProviderRuntimeHooks: true,
    });
    if (!resolved.model) {
      throw new Error(
        resolved.error ??
          `Unknown model: ${provider}/${model} (startup warmup only checks static model resolution)`,
      );
    }
  } catch (err) {
    params.log.warn(`startup model warmup failed for ${provider}/${model}: ${String(err)}`);
  }
}

export type StartGatewaySidecarsLiteParams = {
  cfg: ReturnType<typeof loadConfig>;
  pluginRegistry: ReturnType<typeof loadOpenClawPlugins>;
  defaultWorkspaceDir: string;
  deps: CliDeps;
  /**
   * Channel start function. Pass `channelManager.startChannelsParallel`
   * for parallel startup, or `channelManager.startChannels` for sequential.
   */
  startChannels: () => Promise<void>;
  log: { warn: (msg: string) => void; info?: (msg: string) => void };
  logHooks: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  logChannels: { info: (msg: string) => void; error: (msg: string) => void };
};

/**
 * Lightweight sidecar startup that runs all subsystems in parallel.
 *
 * The key difference from the original `startGatewaySidecars()` is that
 * Gmail watcher, internal hooks, model prewarm, and channel startup all
 * run concurrently via `Promise.allSettled()` instead of blocking each
 * other sequentially.
 *
 * @returns `{ pluginServices }` — the plugin services handle (may be null
 * if startup hasn't completed yet, since it runs in the background).
 */
export async function startGatewaySidecarsLite(
  params: StartGatewaySidecarsLiteParams,
): Promise<{ pluginServices: PluginServicesHandle | null }> {
  const { cfg, pluginRegistry, defaultWorkspaceDir, deps, log, logHooks, logChannels } = params;

  // ── Step 0: Session lock cleanup (must complete first) ───────────────
  try {
    const stateDir = resolveStateDir(process.env);
    const sessionDirs = await resolveAgentSessionDirs(stateDir);
    for (const sessionsDir of sessionDirs) {
      await cleanStaleLockFiles({
        sessionsDir,
        staleMs: SESSION_LOCK_STALE_MS,
        removeStale: true,
        log: { warn: (message) => log.warn(message) },
      });
    }
  } catch (err) {
    log.warn(`session lock cleanup failed on startup: ${String(err)}`);
  }

  // ── Step 1: Launch all subsystems in parallel ────────────────────────
  // Gmail watcher, internal hooks, model prewarm, and channel startup
  // are all independent — they can run concurrently.
  const skipChannels =
    isTruthyEnvValue(process.env.OPENCLAW_SKIP_CHANNELS) ||
    isTruthyEnvValue(process.env.OPENCLAW_SKIP_PROVIDERS);

  if (skipChannels) {
    logChannels.info(
      "skipping channel start (OPENCLAW_SKIP_CHANNELS=1 or OPENCLAW_SKIP_PROVIDERS=1)",
    );
  }

  // Build the parallel work items. Each is a fire-and-forget promise that
  // logs its own errors, so we use Promise.allSettled.
  const parallelTasks: Array<{ name: string; fn: () => Promise<unknown> }> = [
    {
      name: "gmail-watcher",
      fn: async () => {
        await startGmailWatcherWithLogs({ cfg, log: logHooks });
      },
    },
    {
      name: "gmail-model-validation",
      fn: async () => {
        if (!cfg.hooks?.gmail?.model) return;
        const hooksModelRef = resolveHooksGmailModel({ cfg, defaultProvider: DEFAULT_PROVIDER });
        if (!hooksModelRef) return;
        const { provider: defaultProvider, model: defaultModel } = resolveConfiguredModelRef({
          cfg,
          defaultProvider: DEFAULT_PROVIDER,
          defaultModel: DEFAULT_MODEL,
        });
        const catalog = await loadModelCatalog({ config: cfg });
        const status = getModelRefStatus({ cfg, catalog, ref: hooksModelRef, defaultProvider, defaultModel });
        if (!status.allowed) {
          logHooks.warn(
            `hooks.gmail.model "${status.key}" not in agents.defaults.models allowlist (will use primary instead)`,
          );
        }
        if (!status.inCatalog) {
          logHooks.warn(
            `hooks.gmail.model "${status.key}" not in the model catalog (may fail at runtime)`,
          );
        }
      },
    },
    {
      name: "internal-hooks",
      fn: async () => {
        try {
          clearInternalHooks();
          const loadedCount = await loadInternalHooks(cfg, defaultWorkspaceDir);
          if (loadedCount > 0) {
            logHooks.info(
              `loaded ${loadedCount} internal hook handler${loadedCount > 1 ? "s" : ""}`,
            );
          }
        } catch (err) {
          logHooks.error(`failed to load hooks: ${String(err)}`);
        }
      },
    },
    {
      name: "model-prewarm",
      fn: async () => {
        if (skipChannels) return;
        await prewarmConfiguredPrimaryModel({ cfg, log });
      },
    },
    {
      name: "channels",
      fn: async () => {
        if (skipChannels) return;
        await params.startChannels();
      },
    },
  ];

  // Execute all tasks in parallel — none blocks the others.
  const settled = await Promise.allSettled(
    parallelTasks.map(async (task) => {
      const start = performance.now();
      try {
        await task.fn();
        log.info?.(`${task.name} ready (${(performance.now() - start).toFixed(0)}ms)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`${task.name} failed: ${msg}`);
        throw err;
      }
    }),
  );

  // Log summary
  const failed = settled.filter((s) => s.status === "rejected");
  if (failed.length > 0) {
    const names = failed.map((_, i) => parallelTasks[settled.indexOf(failed[i]!)]?.name).filter(Boolean);
    log.warn(`parallel sidecar startup: ${failed.length} task(s) failed: ${names.join(", ")}`);
  }

  // ── Step 2: Background services (non-blocking) ───────────────────────

  // Internal hook: gateway:startup event
  if (cfg.hooks?.internal?.enabled !== false) {
    setTimeout(() => {
      const hookEvent = createInternalHookEvent("gateway", "startup", "gateway:startup", {
        cfg,
        deps,
        workspaceDir: defaultWorkspaceDir,
      });
      void triggerInternalHook(hookEvent);
    }, 250);
  }

  // Plugin services (background — result collected via promise)
  let pluginServices: PluginServicesHandle | null = null;
  void startPluginServices({
    registry: pluginRegistry,
    config: cfg,
    workspaceDir: defaultWorkspaceDir,
  })
    .then((services) => {
      pluginServices = services;
      log.info?.("plugin services started");
    })
    .catch((err) => {
      log.warn(`plugin services failed to start: ${String(err)}`);
    });

  // ACP session identity reconcile
  if (cfg.acp?.enabled) {
    void getAcpSessionManager()
      .reconcilePendingSessionIdentities({ cfg })
      .then((result) => {
        if (result.checked === 0) return;
        log.warn(
          `acp startup identity reconcile (renderer=${ACP_SESSION_IDENTITY_RENDERER_VERSION}): checked=${result.checked} resolved=${result.resolved} failed=${result.failed}`,
        );
      })
      .catch((err) => {
        log.warn(`acp startup identity reconcile failed: ${String(err)}`);
      });
  }

  // Memory backend
  void startGatewayMemoryBackend({ cfg, log }).catch((err) => {
    log.warn(`qmd memory startup initialization failed: ${String(err)}`);
  });

  // Restart sentinel
  if (shouldWakeFromRestartSentinel()) {
    setTimeout(() => {
      void scheduleRestartSentinelWake({ deps });
    }, 750);
  }

  return { pluginServices };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export const __testing = {
  prewarmConfiguredPrimaryModel,
};
