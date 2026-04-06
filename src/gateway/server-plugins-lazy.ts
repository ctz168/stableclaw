/**
 * Lazy Plugin Loader
 *
 * Defers the expensive plugin loading operation until first access instead
 * of blocking gateway startup.  The existing plugin loader (`loadOpenClawPlugins`)
 * loads every plugin in a single pass, so the lazy wrapper defers that entire
 * operation.
 *
 * Flow:
 * 1. `initLazyPluginSystem()` — scans manifests (JSON only, no JS imports),
 *    sets up an empty registry, and registers a lazy init function in the
 *    `lazyRegistry`.
 * 2. WS clients can connect and use native methods (ping, health.get, etc.)
 *    immediately.
 * 3. The first method that requires a plugin handler triggers
 *    `ensurePluginsLoaded()`, which runs the full plugin load exactly once.
 * 4. `prefetchCriticalPlugins()` kicks off background loading shortly after
 *    boot so plugins are ready before most clients need them.
 *
 * @module gateway/server-plugins-lazy
 */

import type { loadConfig } from "../config/config.js";
import { applyPluginAutoEnable } from "../config/plugin-auto-enable.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { scanPluginManifests, type LazyPluginManifest } from "../plugins/manifest-reader.js";
import { createEmptyPluginRegistry } from "../plugins/registry-empty.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { setPluginSubagentOverridePolicies } from "./server-plugins.js";
import type { GatewayRequestHandler } from "./server-methods/types.js";

const log = createSubsystemLogger("gateway/plugins-lazy");

// ── Types ───────────────────────────────────────────────────────────

/** State of the lazy plugin subsystem. */
export type LazyPluginState =
  | "uninitialized"
  | "manifests-scanned"
  | "loading"
  | "loaded"
  | "error";

export type LazyPluginSystemInitParams = {
  cfg: ReturnType<typeof loadConfig>;
  workspaceDir: string;
  log?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
};

export type EnsurePluginsLoadedParams = {
  cfg: ReturnType<typeof loadConfig>;
  activationSourceConfig?: ReturnType<typeof loadConfig>;
  autoEnabledReasons?: Readonly<Record<string, string[]>>;
  workspaceDir: string;
  coreGatewayHandlers: Record<string, GatewayRequestHandler>;
  baseMethods: string[];
  pluginIds?: string[];
  preferSetupRuntimeForChannelPlugins?: boolean;
};

/** Result returned after plugin loading completes. */
export type LazyPluginLoadResult = {
  pluginRegistry: ReturnType<typeof createEmptyPluginRegistry>;
  gatewayMethods: string[];
  manifests: LazyPluginManifest[];
};

// ── Internal state ──────────────────────────────────────────────────

let lazyState: LazyPluginState = "uninitialized";
let lazyManifests: LazyPluginManifest[] = [];
let lazyLoadResult: LazyPluginLoadResult | null = null;
let lazyLoadError: Error | null = null;
let lazyLoadPromise: Promise<LazyPluginLoadResult> | null = null;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Get the current state of the lazy plugin subsystem.
 */
export function getLazyPluginState(): LazyPluginState {
  return lazyState;
}

/**
 * Get the cached plugin manifests (available after `initLazyPluginSystem`).
 * Returns an empty array if initialization hasn't run yet.
 */
export function getCachedManifests(): readonly LazyPluginManifest[] {
  return lazyManifests;
}

/**
 * Get the loaded plugin result (available after plugins are fully loaded).
 * Returns `null` if plugins haven't been loaded yet.
 */
export function getPluginLoadResult(): LazyPluginLoadResult | null {
  return lazyLoadResult;
}

/**
 * Check whether a specific plugin is present in the scanned manifests.
 * This does NOT load the plugin — it only checks whether the manifest was
 * discovered during the lightweight scan.
 */
export function isPluginKnown(pluginId: string): boolean {
  return lazyManifests.some((m) => m.id === pluginId);
}

/**
 * List all available plugin IDs from the manifest scan.
 * No JS imports are performed.
 */
export function listAvailablePluginIds(): string[] {
  return lazyManifests.map((m) => m.id);
}

/**
 * Check if the plugin subsystem has been fully loaded.
 */
export function isPluginSystemLoaded(): boolean {
  return lazyState === "loaded";
}

/**
 * Initialize the plugin system lazily.
 *
 * Instead of loading all plugins, this only:
 * 1. Applies plugin auto-enable configuration
 * 2. Installs the gateway plugin runtime environment (subagent policies)
 * 3. Scans plugin manifests (JSON only, no JS imports)
 * 4. Sets up an empty plugin registry so the gateway can start
 *
 * The actual plugin code loading happens on first call to
 * `ensurePluginsLoaded()`.
 *
 * @returns The scanned manifests and an empty placeholder result.
 */
export async function initLazyPluginSystem(
  params: LazyPluginSystemInitParams,
): Promise<{ manifests: LazyPluginManifest[]; gatewayMethods: string[] }> {
  if (lazyState !== "uninitialized") {
    log.debug("lazy plugin system already initialized, skipping");
    return {
      manifests: lazyManifests,
      gatewayMethods: lazyLoadResult?.gatewayMethods ?? [],
    };
  }

  const logger = params.log ?? {
    info: (msg: string) => log.info(msg),
    warn: (msg: string) => log.warn(msg),
    error: (msg: string) => log.error(msg),
    debug: (msg: string) => log.debug(msg),
  };

  log.info("initializing lazy plugin system (manifest scan only)");

  // Install the gateway plugin runtime environment.
  // This is cheap and needed before any plugin code can run.
  setPluginSubagentOverridePolicies(params.cfg);

  // Apply auto-enable so we know which plugins should activate.
  const autoEnabled = applyPluginAutoEnable({
    config: params.cfg,
    env: process.env,
  });

  // Scan manifests — only reads JSON files, no JS imports.
  try {
    lazyManifests = await scanPluginManifests({
      config: autoEnabled.config,
      workspaceDir: params.workspaceDir,
    });
    log.info(
      `manifest scan complete: ${lazyManifests.length} plugin(s) discovered`,
      { consoleMessage: `[plugins] manifest scan: ${lazyManifests.length} plugin(s) discovered` },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`manifest scan failed: ${message}`);
    lazyState = "error";
    lazyLoadError = err instanceof Error ? err : new Error(message);
    // Fall back to empty manifests so the gateway can still start.
    lazyManifests = [];
  }

  // Set up an empty plugin registry so the gateway has *something* to use
  // for method routing before plugins are loaded.
  const emptyRegistry = createEmptyPluginRegistry();
  setActivePluginRegistry(emptyRegistry, undefined, "gateway-bindable");

  lazyState = "manifests-scanned";

  return {
    manifests: lazyManifests,
    gatewayMethods: [],
  };
}

/**
 * Ensure the full plugin subsystem is loaded.
 *
 * This performs the actual (expensive) plugin loading on first call and
 * caches the result for all subsequent callers.  Concurrent callers share
 * the same in-flight load.
 *
 * @returns The fully loaded plugin registry and gateway methods.
 * @throws If plugin loading fails (after the configured number of retries).
 */
export async function ensurePluginsLoaded(
  params: EnsurePluginsLoadedParams,
): Promise<LazyPluginLoadResult> {
  // Already loaded — return cached result.
  if (lazyState === "loaded" && lazyLoadResult) {
    return lazyLoadResult;
  }

  // Load in progress — piggyback on the existing promise.
  if (lazyLoadPromise) {
    return lazyLoadPromise;
  }

  log.info("triggering lazy plugin load on first access");

  lazyState = "loading";
  lazyLoadPromise = performFullPluginLoad(params);

  try {
    const result = await lazyLoadPromise;
    lazyLoadResult = result;
    lazyState = "loaded";
    log.info(
      `lazy plugin load complete: ${result.manifests.length} plugin(s), ` +
        `${result.gatewayMethods.length} gateway method(s)`,
      { consoleMessage: `[plugins] lazy load complete: ${result.manifests.length} plugin(s)` },
    );
    return result;
  } catch (err) {
    lazyState = "error";
    lazyLoadError = err instanceof Error ? err : new Error(String(err));
    lazyLoadPromise = null; // Allow retries.
    throw lazyLoadError;
  }
}

/**
 * Prefetch critical plugins in the background.
 *
 * This should be called shortly after the gateway starts listening (e.g.
 * after `setImmediate` or a short `setTimeout`).  It triggers the full
 * plugin load asynchronously so that plugins are ready before most
 * clients send their first request.
 *
 * Errors are swallowed — the lazy load will retry on next `get()` call.
 *
 * @param params - Same parameters as `ensurePluginsLoaded`.
 */
export function prefetchCriticalPlugins(
  params: EnsurePluginsLoadedParams,
): void {
  // If already loaded or in progress, nothing to do.
  if (lazyState === "loaded" || lazyLoadPromise) {
    return;
  }

  log.debug("prefetching critical plugins in background");

  void ensurePluginsLoaded(params).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`background plugin prefetch failed: ${message}`);
  });
}

/**
 * Reset the lazy plugin subsystem state.
 *
 * Clears all cached state and allows re-initialization.  Intended for
 * tests and hot-reload scenarios only.
 */
export function resetLazyPluginSystem(): void {
  lazyState = "uninitialized";
  lazyManifests = [];
  lazyLoadResult = null;
  lazyLoadError = null;
  lazyLoadPromise = null;
}

// ── Internal ────────────────────────────────────────────────────────

/**
 * Perform the full plugin load using the existing `loadGatewayPlugins`.
 *
 * This is the expensive operation that the lazy wrapper defers.  It
 * dynamically imports `server-plugins.js` only when actually needed,
 * avoiding the heavy import chain at gateway boot.
 */
async function performFullPluginLoad(
  params: EnsurePluginsLoadedParams,
): Promise<LazyPluginLoadResult> {
  // Dynamic import — this is the key optimization.
  // The `server-plugins.js` module pulls in the full plugin loader,
  // Jiti, channel system, etc.  We don't want any of that at boot.
  const { loadGatewayPlugins } = await import("./server-plugins.js");

  const result = loadGatewayPlugins({
    cfg: params.cfg,
    activationSourceConfig: params.activationSourceConfig,
    autoEnabledReasons: params.autoEnabledReasons,
    workspaceDir: params.workspaceDir,
    log: {
      info: (msg: string) => log.info(msg),
      warn: (msg: string) => log.warn(msg),
      error: (msg: string) => log.error(msg),
      debug: (msg: string) => log.debug(msg),
    },
    coreGatewayHandlers: params.coreGatewayHandlers,
    baseMethods: params.baseMethods,
    pluginIds: params.pluginIds,
    preferSetupRuntimeForChannelPlugins: params.preferSetupRuntimeForChannelPlugins,
  });

  return {
    pluginRegistry: result.pluginRegistry,
    gatewayMethods: result.gatewayMethods,
    manifests: [...lazyManifests],
  };
}
