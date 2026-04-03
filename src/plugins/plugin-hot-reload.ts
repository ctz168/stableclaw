import type { OpenClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getActivePluginRegistry, setActivePluginRegistry } from "./runtime.js";
import type { PluginRegistry, PluginRecord } from "./registry.js";
import { recordPluginError, isPluginDisabled, enablePlugin } from "./plugin-error-handler.js";

const log = createSubsystemLogger("plugin-hot-reload");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Filter out registrations belonging to a specific plugin. */
const filterByPlugin = <T extends { pluginId: string }>(
  items: T[],
  pluginId: string,
): T[] => items.filter((item) => item.pluginId !== pluginId);

// ---------------------------------------------------------------------------
// PluginHotReloadManager
// ---------------------------------------------------------------------------

/**
 * Plugin hot reload manager.
 * Handles loading, unloading, and reloading plugins without restarting gateway.
 */
export class PluginHotReloadManager {
  private lock: Promise<void> = Promise.resolve();

  // ---- Mutex --------------------------------------------------------------

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.lock;
    let resolveLock!: () => void;
    this.lock = new Promise<void>((r) => {
      resolveLock = r;
    });
    await previous;
    try {
      return await fn();
    } finally {
      resolveLock();
    }
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Load a newly installed plugin.
   *
   * Creates a registration-stage record in the active registry so that the
   * plugin is visible to the system immediately.  Full initialisation (manifest
   * parsing, dependency resolution, hook registration, etc.) happens on the
   * next gateway restart via the normal loader pipeline.
   */
  async loadNewPlugin(params: {
    pluginId: string;
    installPath: string;
    config: OpenClawConfig;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.withLock(() => this.loadNewPluginInternal(params));
  }

  /**
   * Unload a plugin before uninstalling.
   *
   * Removes the plugin's `PluginRecord` **and** every registration (tools,
   * hooks, channels, providers, gateway methods, …) that references its id.
   */
  async unloadPlugin(params: {
    pluginId: string;
    config: OpenClawConfig;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.withLock(() => this.unloadPluginInternal(params));
  }

  /**
   * Reload a plugin (e.g. after an update).
   *
   * Runs unload → load inside a **single** lock acquisition to avoid the
   * deadlock that would result from calling the public `unloadPlugin` /
   * `loadNewPlugin` methods (each of which acquires the same lock).
   */
  async reloadPlugin(params: {
    pluginId: string;
    installPath: string;
    config: OpenClawConfig;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.withLock(async () => {
      const unloadResult = await this.unloadPluginInternal(params);
      if (!unloadResult.ok) {
        return unloadResult;
      }
      return this.loadNewPluginInternal(params);
    });
  }

  // ---- Query helpers (delegated to registry, no local map) -----------------

  getActivePluginCount(): number {
    const registry = getActivePluginRegistry();
    return registry ? registry.plugins.length : 0;
  }

  isPluginLoaded(pluginId: string): boolean {
    const registry = getActivePluginRegistry();
    return registry ? registry.plugins.some((p) => p.id === pluginId) : false;
  }

  // ---- Internal implementations (lock-free) --------------------------------

  private async loadNewPluginInternal(params: {
    pluginId: string;
    installPath: string;
    config: OpenClawConfig;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const { pluginId, installPath } = params;

    log.info(`Loading newly installed plugin: ${pluginId}`);

    // Check if plugin is disabled due to previous errors
    if (isPluginDisabled(pluginId)) {
      log.warn(`Plugin ${pluginId} is disabled, skipping load`);
      return {
        ok: false,
        error: `Plugin ${pluginId} is disabled due to previous errors. Enable it first.`,
      };
    }

    try {
      const currentRegistry = getActivePluginRegistry();
      if (!currentRegistry) {
        return { ok: false, error: "No active plugin registry found" };
      }

      // Check if plugin already loaded
      if (currentRegistry.plugins.some((p) => p.id === pluginId)) {
        log.warn(`Plugin ${pluginId} already loaded, skipping`);
        return { ok: true };
      }

      // Create a fully-populated PluginRecord.
      // This is a registration-stage placeholder; the full loader pipeline
      // (manifest parsing, hook registration, etc.) runs on next gateway
      // restart via `loadOpenClawPlugins()`.
      const newRecord: PluginRecord = {
        id: pluginId,
        name: pluginId,
        source: installPath,
        origin: "global",
        enabled: true,
        status: "loaded",
        toolNames: [],
        hookNames: [],
        channelIds: [],
        cliBackendIds: [],
        providerIds: [],
        speechProviderIds: [],
        mediaUnderstandingProviderIds: [],
        imageGenerationProviderIds: [],
        webFetchProviderIds: [],
        webSearchProviderIds: [],
        gatewayMethods: [],
        cliCommands: [],
        services: [],
        commands: [],
        httpRoutes: 0,
        hookCount: 0,
        configSchema: false,
      };

      const updatedRegistry: PluginRegistry = {
        ...currentRegistry,
        plugins: [...currentRegistry.plugins, newRecord],
      };

      setActivePluginRegistry(updatedRegistry);

      log.info(`Plugin ${pluginId} loaded successfully`);
      return { ok: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to load plugin ${pluginId}: ${errorMsg}`);

      recordPluginError({
        pluginId,
        type: "load",
        severity: "error",
        message: errorMsg,
        error: error instanceof Error ? error : new Error(errorMsg),
      });

      return { ok: false, error: errorMsg };
    }
  }

  private async unloadPluginInternal(params: {
    pluginId: string;
    config: OpenClawConfig;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const { pluginId } = params;

    log.info(`Unloading plugin: ${pluginId}`);

    try {
      const currentRegistry = getActivePluginRegistry();
      if (!currentRegistry) {
        return { ok: false, error: "No active plugin registry found" };
      }

      // Find the plugin record (we need it for gatewayMethods cleanup)
      const pluginRecord = currentRegistry.plugins.find((p) => p.id === pluginId);
      if (!pluginRecord) {
        log.warn(`Plugin ${pluginId} not found in registry, skipping unload`);
        return { ok: true };
      }

      // --- Clean gateway handlers (Record<string, handler>) ---------------
      const cleanedGatewayHandlers = { ...currentRegistry.gatewayHandlers };
      for (const method of pluginRecord.gatewayMethods) {
        delete cleanedGatewayHandlers[method];
      }

      // --- Clean gateway method scopes -------------------------------------
      let cleanedMethodScopes: typeof currentRegistry.gatewayMethodScopes | undefined;
      if (currentRegistry.gatewayMethodScopes) {
        const scopes = { ...currentRegistry.gatewayMethodScopes };
        for (const method of pluginRecord.gatewayMethods) {
          delete scopes[method];
        }
        cleanedMethodScopes = Object.keys(scopes).length > 0 ? scopes : undefined;
      }

      // --- Clean all registration arrays ------------------------------------
      const updatedRegistry: PluginRegistry = {
        plugins: currentRegistry.plugins.filter((p) => p.id !== pluginId),
        tools: filterByPlugin(currentRegistry.tools, pluginId),
        hooks: filterByPlugin(currentRegistry.hooks, pluginId),
        typedHooks: filterByPlugin(currentRegistry.typedHooks, pluginId),
        channels: filterByPlugin(currentRegistry.channels, pluginId),
        channelSetups: filterByPlugin(currentRegistry.channelSetups, pluginId),
        providers: filterByPlugin(currentRegistry.providers, pluginId),
        cliBackends: currentRegistry.cliBackends
          ? filterByPlugin(currentRegistry.cliBackends, pluginId)
          : currentRegistry.cliBackends,
        speechProviders: filterByPlugin(currentRegistry.speechProviders, pluginId),
        mediaUnderstandingProviders: filterByPlugin(
          currentRegistry.mediaUnderstandingProviders,
          pluginId,
        ),
        imageGenerationProviders: filterByPlugin(
          currentRegistry.imageGenerationProviders,
          pluginId,
        ),
        webFetchProviders: filterByPlugin(currentRegistry.webFetchProviders, pluginId),
        webSearchProviders: filterByPlugin(currentRegistry.webSearchProviders, pluginId),
        gatewayHandlers: cleanedGatewayHandlers,
        gatewayMethodScopes: cleanedMethodScopes,
        // httpRoutes uses optional pluginId — keep only entries without this
        // plugin's id (or no pluginId at all).
        httpRoutes: currentRegistry.httpRoutes.filter(
          (r) => r.pluginId !== pluginId,
        ),
        cliRegistrars: filterByPlugin(currentRegistry.cliRegistrars, pluginId),
        services: filterByPlugin(currentRegistry.services, pluginId),
        commands: filterByPlugin(currentRegistry.commands, pluginId),
        conversationBindingResolvedHandlers: filterByPlugin(
          currentRegistry.conversationBindingResolvedHandlers,
          pluginId,
        ),
        diagnostics: currentRegistry.diagnostics.filter(
          (d) => d.pluginId !== pluginId,
        ),
      };

      setActivePluginRegistry(updatedRegistry);

      // Enable plugin if it was disabled (prepare for potential reinstall)
      enablePlugin(pluginId);

      log.info(`Plugin ${pluginId} unloaded successfully`);
      return { ok: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to unload plugin ${pluginId}: ${errorMsg}`);

      recordPluginError({
        pluginId,
        type: "load",
        severity: "error",
        message: errorMsg,
        error: error instanceof Error ? error : new Error(errorMsg),
      });

      return { ok: false, error: errorMsg };
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let globalHotReloadManager: PluginHotReloadManager | undefined;

export function getPluginHotReloadManager(): PluginHotReloadManager {
  if (!globalHotReloadManager) {
    globalHotReloadManager = new PluginHotReloadManager();
  }
  return globalHotReloadManager;
}

/** Reset the global singleton. Intended for tests only. */
export function resetPluginHotReloadManagerForTest(): void {
  globalHotReloadManager = undefined;
}

// ---------------------------------------------------------------------------
// Convenience functions (match the public API surface consumed by callers)
// ---------------------------------------------------------------------------

export async function loadNewPlugin(params: {
  pluginId: string;
  installPath: string;
  config: OpenClawConfig;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return getPluginHotReloadManager().loadNewPlugin(params);
}

export async function unloadPlugin(params: {
  pluginId: string;
  config: OpenClawConfig;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return getPluginHotReloadManager().unloadPlugin(params);
}

export async function reloadPlugin(params: {
  pluginId: string;
  installPath: string;
  config: OpenClawConfig;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return getPluginHotReloadManager().reloadPlugin(params);
}
