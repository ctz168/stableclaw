import type { OpenClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getActivePluginRegistry, setActivePluginRegistry } from "./runtime.js";
import type { PluginRegistry, PluginRecord } from "./registry.js";
import { createPluginRegistry } from "./registry.js";
import { recordPluginError, isPluginDisabled, enablePlugin } from "./plugin-error-handler.js";

const log = createSubsystemLogger("plugin-hot-reload");

/**
 * Plugin hot reload manager
 * Handles loading, unloading, and reloading plugins without restarting gateway
 */
export class PluginHotReloadManager {
  private activePlugins: Map<string, PluginRecord> = new Map();
  private lock: Promise<void> = Promise.resolve();

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const release = () => {};
    const previous = this.lock;
    let resolveLock: () => void;
    this.lock = new Promise<void>(r => { resolveLock = r; });
    await previous;
    try {
      return await fn();
    } finally {
      resolveLock!();
    }
  }

  /**
   * Load a newly installed plugin
   */
  async loadNewPlugin(params: {
    pluginId: string;
    installPath: string;
    config: OpenClawConfig;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.withLock(async () => {
      const { pluginId, installPath, config } = params;

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
        // Get current registry
        const currentRegistry = getActivePluginRegistry();
        if (!currentRegistry) {
          return {
            ok: false,
            error: "No active plugin registry found",
          };
        }

        // Check if plugin already loaded
        const existingPlugin = currentRegistry.plugins.find((p) => p.id === pluginId);
        if (existingPlugin) {
          log.warn(`Plugin ${pluginId} already loaded, skipping`);
          return { ok: true };
        }

        // Create new registry entry for the plugin
        // TODO: This creates a shallow record. It should use the full loader pipeline
        //       (including manifest parsing, dependency resolution, hook registration, etc.)
        //       to ensure the plugin is fully initialized.
        const newRecord: PluginRecord = {
          id: pluginId,
          source: "install",
          status: "loaded",
          sourcePath: installPath,
          loadedAt: new Date().toISOString(),
        };

        // Add to active plugins
        this.activePlugins.set(pluginId, newRecord);

        // Update registry
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

        // Record error for health tracking
        recordPluginError({
          pluginId,
          type: "load",
          severity: "error",
          message: errorMsg,
          error: error instanceof Error ? error : new Error(errorMsg),
        });

        return {
          ok: false,
          error: errorMsg,
        };
      }
    });
  }

  /**
   * Unload a plugin before uninstalling
   */
  async unloadPlugin(params: {
    pluginId: string;
    config: OpenClawConfig;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.withLock(async () => {
      const { pluginId, config } = params;

      log.info(`Unloading plugin: ${pluginId}`);

      try {
        // Get current registry
        const currentRegistry = getActivePluginRegistry();
        if (!currentRegistry) {
          return {
            ok: false,
            error: "No active plugin registry found",
          };
        }

        // Find the plugin
        const pluginIndex = currentRegistry.plugins.findIndex((p) => p.id === pluginId);
        if (pluginIndex === -1) {
          log.warn(`Plugin ${pluginId} not found in registry, skipping unload`);
          return { ok: true };
        }

        // Remove from active plugins
        this.activePlugins.delete(pluginId);

        // Remove from registry
        const updatedPlugins = [...currentRegistry.plugins];
        updatedPlugins.splice(pluginIndex, 1);

        const updatedRegistry: PluginRegistry = {
          ...currentRegistry,
          plugins: updatedPlugins,
        };

        setActivePluginRegistry(updatedRegistry);

        // Enable plugin if it was disabled (prepare for potential reinstall)
        enablePlugin(pluginId);

        log.info(`Plugin ${pluginId} unloaded successfully`);
        return { ok: true };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(`Failed to unload plugin ${pluginId}: ${errorMsg}`);

        return {
          ok: false,
          error: errorMsg,
        };
      }
    });
  }

  /**
   * Reload a plugin (e.g., after update)
   */
  async reloadPlugin(params: {
    pluginId: string;
    installPath: string;
    config: OpenClawConfig;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.withLock(async () => {
      const { pluginId, installPath, config } = params;

      log.info(`Reloading plugin: ${pluginId}`);

      // Unload first
      const unloadResult = await this.unloadPlugin({ pluginId, config });
      if (!unloadResult.ok) {
        return unloadResult;
      }

      // Then load
      return this.loadNewPlugin({ pluginId, installPath, config });
    });
  }

  /**
   * Get active plugin count
   */
  getActivePluginCount(): number {
    return this.activePlugins.size;
  }

  /**
   * Check if a plugin is currently loaded
   */
  isPluginLoaded(pluginId: string): boolean {
    return this.activePlugins.has(pluginId);
  }
}

/**
 * Global plugin hot reload manager instance
 */
let globalHotReloadManager: PluginHotReloadManager | undefined;

export function getPluginHotReloadManager(): PluginHotReloadManager {
  if (!globalHotReloadManager) {
    globalHotReloadManager = new PluginHotReloadManager();
  }
  return globalHotReloadManager;
}

/**
 * Convenience functions for direct usage
 */
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
