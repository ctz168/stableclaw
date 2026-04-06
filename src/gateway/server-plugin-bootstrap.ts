import { primeConfiguredBindingRegistry } from "../channels/plugins/binding-registry.js";
import type { loadConfig } from "../config/config.js";
import { applyPluginAutoEnable } from "../config/plugin-auto-enable.js";
import type { PluginRegistry } from "../plugins/registry.js";
import { pinActivePluginChannelRegistry } from "../plugins/runtime.js";
import { setGatewaySubagentRuntime } from "../plugins/runtime/index.js";
import type { GatewayRequestHandler } from "./server-methods/types.js";
import {
  createGatewaySubagentRuntime,
  loadGatewayPlugins,
  setPluginSubagentOverridePolicies,
} from "./server-plugins.js";
import {
  ensurePluginsLoaded,
  getCachedManifests,
  getLazyPluginState,
  initLazyPluginSystem,
  prefetchCriticalPlugins,
  isPluginSystemLoaded,
  type LazyPluginLoadResult,
} from "./server-plugins-lazy.js";

type GatewayPluginBootstrapLog = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug: (msg: string) => void;
};

type GatewayPluginBootstrapParams = {
  cfg: ReturnType<typeof loadConfig>;
  workspaceDir: string;
  log: GatewayPluginBootstrapLog;
  coreGatewayHandlers: Record<string, GatewayRequestHandler>;
  baseMethods: string[];
  pluginIds?: string[];
  preferSetupRuntimeForChannelPlugins?: boolean;
  logDiagnostics?: boolean;
  beforePrimeRegistry?: (pluginRegistry: PluginRegistry) => void;
};

function installGatewayPluginRuntimeEnvironment(cfg: ReturnType<typeof loadConfig>) {
  setPluginSubagentOverridePolicies(cfg);
  setGatewaySubagentRuntime(createGatewaySubagentRuntime());
}

function logGatewayPluginDiagnostics(params: {
  diagnostics: PluginRegistry["diagnostics"];
  log: Pick<GatewayPluginBootstrapLog, "error" | "info">;
}) {
  for (const diag of params.diagnostics) {
    const details = [
      diag.pluginId ? `plugin=${diag.pluginId}` : null,
      diag.source ? `source=${diag.source}` : null,
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(", ");
    const message = details
      ? `[plugins] ${diag.message} (${details})`
      : `[plugins] ${diag.message}`;
    if (diag.level === "error") {
      params.log.error(message);
    } else {
      params.log.info(message);
    }
  }
}

export function prepareGatewayPluginLoad(params: GatewayPluginBootstrapParams) {
  const autoEnabled = applyPluginAutoEnable({
    config: params.cfg,
    env: process.env,
  });
  const resolvedConfig = autoEnabled.config;
  installGatewayPluginRuntimeEnvironment(resolvedConfig);
  const loaded = loadGatewayPlugins({
    cfg: resolvedConfig,
    activationSourceConfig: params.cfg,
    autoEnabledReasons: autoEnabled.autoEnabledReasons,
    workspaceDir: params.workspaceDir,
    log: params.log,
    coreGatewayHandlers: params.coreGatewayHandlers,
    baseMethods: params.baseMethods,
    pluginIds: params.pluginIds,
    preferSetupRuntimeForChannelPlugins: params.preferSetupRuntimeForChannelPlugins,
  });
  params.beforePrimeRegistry?.(loaded.pluginRegistry);
  primeConfiguredBindingRegistry({ cfg: resolvedConfig });
  if ((params.logDiagnostics ?? true) && loaded.pluginRegistry.diagnostics.length > 0) {
    logGatewayPluginDiagnostics({
      diagnostics: loaded.pluginRegistry.diagnostics,
      log: params.log,
    });
  }
  return loaded;
}

export function loadGatewayStartupPlugins(
  params: Omit<GatewayPluginBootstrapParams, "beforePrimeRegistry">,
) {
  return prepareGatewayPluginLoad(params);
}

export function reloadDeferredGatewayPlugins(
  params: Omit<
    GatewayPluginBootstrapParams,
    "beforePrimeRegistry" | "preferSetupRuntimeForChannelPlugins"
  >,
) {
  return prepareGatewayPluginLoad({
    ...params,
    beforePrimeRegistry: pinActivePluginChannelRegistry,
  });
}

// ── Lazy plugin bootstrap ──────────────────────────────────────────

export type LazyGatewayPluginBootstrapParams = {
  cfg: ReturnType<typeof loadConfig>;
  workspaceDir: string;
  log: GatewayPluginBootstrapLog;
  coreGatewayHandlers: Record<string, GatewayRequestHandler>;
  baseMethods: string[];
  pluginIds?: string[]
  preferSetupRuntimeForChannelPlugins?: boolean;
};

export type LazyGatewayPluginBootstrapResult = {
  /** Lightweight manifest metadata (no JS loaded). */
  manifests: ReturnType<typeof getCachedManifests>;
  /** Gateway methods available before plugins load (base methods only). */
  gatewayMethods: string[];
  /** Promise that resolves when the full plugin load completes. */
  loadPromise: Promise<LazyPluginLoadResult>;
  /** Check if plugins are loaded without triggering a load. */
  isLoaded: () => boolean;
};

/**
 * Prepare gateway plugin loading in lazy mode.
 *
 * Unlike {@link loadGatewayStartupPlugins}, this does NOT load any plugin
 * JavaScript at startup.  Instead it:
 *
 * 1. Installs the gateway plugin runtime environment (cheap)
 * 2. Scans plugin manifests (JSON only, no JS imports)
 * 3. Sets up an empty plugin registry
 * 4. Returns immediately with base methods only
 *
 * The actual plugin code loading happens when:
 * - A WS client sends a method that requires a plugin handler
 * - `prefetchCriticalPlugins()` is called after the server starts listening
 *
 * @returns A result object with manifests, base methods, and a load promise.
 */
export async function prepareGatewayPluginLoadLazy(
  params: LazyGatewayPluginBootstrapParams,
): Promise<LazyGatewayPluginBootstrapResult> {
  // Install the gateway plugin runtime environment.
  // This is cheap and needed before any plugin code can run.
  const autoEnabled = applyPluginAutoEnable({
    config: params.cfg,
    env: process.env,
  });
  const resolvedConfig = autoEnabled.config;
  installGatewayPluginRuntimeEnvironment(resolvedConfig);

  // Initialize lazy plugin system — scans manifests only.
  const { manifests } = await initLazyPluginSystem({
    cfg: resolvedConfig,
    workspaceDir: params.workspaceDir,
    log: params.log,
  });

  // Build the load promise for full plugin loading.
  // This will be triggered by prefetchCriticalPlugins or first access.
  const ensureParams = {
    cfg: resolvedConfig,
    activationSourceConfig: params.cfg,
    autoEnabledReasons: autoEnabled.autoEnabledReasons,
    workspaceDir: params.workspaceDir,
    coreGatewayHandlers: params.coreGatewayHandlers,
    baseMethods: params.baseMethods,
    pluginIds: params.pluginIds,
    preferSetupRuntimeForChannelPlugins: params.preferSetupRuntimeForChannelPlugins,
  };

  return {
    manifests,
    gatewayMethods: [...params.baseMethods],
    loadPromise: ensurePluginsLoaded(ensureParams),
    isLoaded: isPluginSystemLoaded,
  };
}

/**
 * Lazy variant of {@link loadGatewayStartupPlugins}.
 *
 * Scans manifests and returns immediately.  Call `result.loadPromise`
 * (or use `prefetchCriticalPlugins`) to trigger the full load.
 */
export async function loadGatewayStartupPluginsLazy(
  params: LazyGatewayPluginBootstrapParams,
): Promise<LazyGatewayPluginBootstrapResult> {
  return prepareGatewayPluginLoadLazy(params);
}

/**
 * Trigger background prefetch of all plugins.
 *
 * Call this after the gateway HTTP/WS server is listening so plugins
 * load without blocking the accept loop.
 */
export function prefetchGatewayPlugins(
  params: LazyGatewayPluginBootstrapParams,
): void {
  const autoEnabled = applyPluginAutoEnable({
    config: params.cfg,
    env: process.env,
  });
  prefetchCriticalPlugins({
    cfg: autoEnabled.config,
    activationSourceConfig: params.cfg,
    autoEnabledReasons: autoEnabled.autoEnabledReasons,
    workspaceDir: params.workspaceDir,
    coreGatewayHandlers: params.coreGatewayHandlers,
    baseMethods: params.baseMethods,
    pluginIds: params.pluginIds,
    preferSetupRuntimeForChannelPlugins: params.preferSetupRuntimeForChannelPlugins,
  });
}

/**
 * Get the current lazy plugin loading state.
 * Useful for health endpoints and diagnostics.
 */
export function getGatewayPluginLoadState(): string {
  return getLazyPluginState();
}
