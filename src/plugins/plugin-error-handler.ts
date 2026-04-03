import fs from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { PluginDiagnostic } from "./types.js";

const pluginLog = createSubsystemLogger("plugin");

/**
 * Plugin error types
 */
export type PluginErrorType =
  | "load"
  | "runtime"
  | "hook"
  | "channel"
  | "provider"
  | "tool"
  | "command";

/**
 * Plugin error severity
 */
export type PluginErrorSeverity = "warning" | "error" | "critical";

/**
 * Plugin error record
 */
export type PluginError = {
  pluginId: string;
  type: PluginErrorType;
  severity: PluginErrorSeverity;
  message: string;
  error?: Error;
  timestamp: string;
  stack?: string;
};

/**
 * Plugin health status
 */
export type PluginHealthStatus = {
  pluginId: string;
  status: "healthy" | "degraded" | "failed" | "disabled";
  lastCheck: string;
  errors: PluginError[];
  consecutiveErrors: number;
  lastError?: PluginError;
};

/**
 * Plugin backup for rollback
 */
export type PluginBackup = {
  pluginId: string;
  version?: string;
  installPath: string;
  config?: Record<string, unknown>;
  timestamp: string;
  manifest?: Record<string, unknown>;
};

/**
 * Global plugin error state
 */
type PluginErrorState = {
  errors: Map<string, PluginError[]>;
  healthStatus: Map<string, PluginHealthStatus>;
  backups: Map<string, PluginBackup>;
  disabledPlugins: Set<string>;
};

const PLUGIN_ERROR_STATE = Symbol.for("openclaw.pluginErrorState");

function getPluginErrorState(): PluginErrorState {
  const globalState = globalThis as typeof globalThis & {
    [PLUGIN_ERROR_STATE]?: PluginErrorState;
  };
  if (!globalState[PLUGIN_ERROR_STATE]) {
    globalState[PLUGIN_ERROR_STATE] = {
      errors: new Map(),
      healthStatus: new Map(),
      backups: new Map(),
      disabledPlugins: new Set(),
    };
  }
  return globalState[PLUGIN_ERROR_STATE];
}

/**
 * Record a plugin error
 */
export function recordPluginError(params: {
  pluginId: string;
  type: PluginErrorType;
  severity: PluginErrorSeverity;
  message: string;
  error?: Error;
}): PluginError {
  const state = getPluginErrorState();
  const pluginError: PluginError = {
    pluginId: params.pluginId,
    type: params.type,
    severity: params.severity,
    message: params.message,
    error: params.error,
    timestamp: new Date().toISOString(),
    stack: params.error?.stack,
  };

  // Add to error history
  let pluginErrors = state.errors.get(params.pluginId);
  if (!pluginErrors) {
    pluginErrors = [];
    state.errors.set(params.pluginId, pluginErrors);
  }
  pluginErrors.push(pluginError);

  // Keep only last 10 errors per plugin
  if (pluginErrors.length > 10) {
    pluginErrors.shift();
  }

  // Update health status
  updatePluginHealthStatus(params.pluginId, pluginError);

  // Don't auto-disable here; let the health checker handle recovery decisions.
  // Only log and track the error.

  pluginLog.error(
    `[plugin-error] ${params.pluginId} (${params.type}/${params.severity}): ${params.message}`,
  );

  return pluginError;
}

/**
 * Update plugin health status
 */
function updatePluginHealthStatus(pluginId: string, error: PluginError): void {
  const state = getPluginErrorState();
  let status = state.healthStatus.get(pluginId);

  if (!status) {
    status = {
      pluginId,
      status: "healthy",
      lastCheck: new Date().toISOString(),
      errors: [],
      consecutiveErrors: 0,
    };
    state.healthStatus.set(pluginId, status);
  }

  status.lastCheck = new Date().toISOString();
  status.errors.push(error);
  status.lastError = error;
  status.consecutiveErrors += 1;

  // Update status based on error severity and count
  if (status.consecutiveErrors >= 3 || error.severity === "critical") {
    status.status = "failed";
  } else if (status.consecutiveErrors >= 1) {
    status.status = "degraded";
  }
}

/**
 * Disable a plugin
 */
export function disablePlugin(pluginId: string, reason: string): void {
  const state = getPluginErrorState();
  state.disabledPlugins.add(pluginId);

  pluginLog.warn(`[plugin-disable] ${pluginId} disabled: ${reason}`);

  // Update health status
  const status = state.healthStatus.get(pluginId);
  if (status) {
    status.status = "disabled";
  }
}

/**
 * Enable a plugin
 */
export function enablePlugin(pluginId: string): void {
  const state = getPluginErrorState();
  state.disabledPlugins.delete(pluginId);

  // Reset health status
  const status = state.healthStatus.get(pluginId);
  if (status) {
    status.status = "healthy";
    status.consecutiveErrors = 0;
    status.errors = [];
    status.lastError = undefined;
  }

  pluginLog.info(`[plugin-enable] ${pluginId} enabled`);
}

/**
 * Check if a plugin is disabled
 */
export function isPluginDisabled(pluginId: string): boolean {
  const state = getPluginErrorState();
  return state.disabledPlugins.has(pluginId);
}

/**
 * Get plugin health status
 */
export function getPluginHealthStatus(pluginId: string): PluginHealthStatus | undefined {
  const state = getPluginErrorState();
  return state.healthStatus.get(pluginId);
}

/**
 * Get all disabled plugins
 */
export function getDisabledPlugins(): string[] {
  const state = getPluginErrorState();
  return Array.from(state.disabledPlugins);
}

/**
 * Get plugin errors
 */
export function getPluginErrors(pluginId: string): PluginError[] {
  const state = getPluginErrorState();
  return state.errors.get(pluginId) ?? [];
}

/**
 * Clear plugin errors
 */
export function clearPluginErrors(pluginId: string): void {
  const state = getPluginErrorState();
  state.errors.delete(pluginId);

  const status = state.healthStatus.get(pluginId);
  if (status) {
    status.errors = [];
    status.consecutiveErrors = 0;
    status.lastError = undefined;
    if (status.status !== "disabled") {
      status.status = "healthy";
    }
  }
}

/**
 * Create plugin backup for rollback
 */
export async function createPluginBackup(params: {
  pluginId: string;
  version?: string;
  installPath: string;
  config?: Record<string, unknown>;
  manifestPath?: string;
}): Promise<PluginBackup> {
  const backup: PluginBackup = {
    pluginId: params.pluginId,
    version: params.version,
    installPath: params.installPath,
    config: params.config,
    timestamp: new Date().toISOString(),
  };

  // Read manifest if provided
  if (params.manifestPath) {
    try {
      const manifestContent = await fs.readFile(params.manifestPath, "utf-8");
      backup.manifest = JSON.parse(manifestContent);
    } catch {
      // Ignore manifest read errors
    }
  }

  // Store backup
  const state = getPluginErrorState();
  state.backups.set(params.pluginId, backup);

  pluginLog.info(`[plugin-backup] Created backup for ${params.pluginId}`);

  return backup;
}

/**
 * Get plugin backup
 */
export function getPluginBackup(pluginId: string): PluginBackup | undefined {
  const state = getPluginErrorState();
  return state.backups.get(pluginId);
}

/**
 * Rollback plugin to last known good version
 */
export async function rollbackPlugin(params: {
  pluginId: string;
  reason: string;
}): Promise<{ success: boolean; backup?: PluginBackup; error?: string }> {
  const state = getPluginErrorState();
  const backup = state.backups.get(params.pluginId);

  if (!backup) {
    const error = `No backup found for plugin ${params.pluginId}`;
    pluginLog.error(`[plugin-rollback] ${error}`);
    return { success: false, error };
  }

  try {
    pluginLog.info(
      `[plugin-rollback] Rolling back ${params.pluginId} to version ${backup.version ?? "unknown"}: ${params.reason}`,
    );

    // Disable the plugin first
    disablePlugin(params.pluginId, params.reason);

    // Clear errors
    clearPluginErrors(params.pluginId);

    // Note: Actual file restoration would be done by the plugin installer
    // This just prepares the state for rollback

    pluginLog.info(`[plugin-rollback] Rollback prepared for ${params.pluginId}`);

    return { success: true, backup };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    pluginLog.error(`[plugin-rollback] Rollback failed for ${params.pluginId}: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Wrap plugin operation with error handling
 */
export async function withPluginErrorHandling<T>(
  pluginId: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  // Check if plugin is disabled
  if (isPluginDisabled(pluginId)) {
    pluginLog.warn(`[plugin-skip] ${pluginId} is disabled, skipping ${operation}`);
    return undefined;
  }

  try {
    return await fn();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    recordPluginError({
      pluginId,
      type: "runtime",
      severity: "error",
      message: `${operation} failed: ${errorMessage}`,
      error: error instanceof Error ? error : new Error(String(error)),
    });

    // Return undefined instead of throwing
    return undefined;
  }
}

/**
 * Wrap plugin hook with error handling
 */
export function wrapPluginHook<TArgs extends unknown[], TResult>(
  pluginId: string,
  hookName: string,
  hook: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult | undefined> {
  return async (...args: TArgs): Promise<TResult | undefined> => {
    return await withPluginErrorHandling(
      pluginId,
      `hook:${hookName}`,
      async () => await hook(...args),
    );
  };
}

/**
 * Check plugin health
 */
export async function checkPluginHealth(pluginId: string): Promise<PluginHealthStatus> {
  const state = getPluginErrorState();
  let status = state.healthStatus.get(pluginId);

  if (!status) {
    status = {
      pluginId,
      status: "healthy",
      lastCheck: new Date().toISOString(),
      errors: [],
      consecutiveErrors: 0,
    };
    state.healthStatus.set(pluginId, status);
  }

  status.lastCheck = new Date().toISOString();

  // Reset consecutive errors if no recent errors
  const recentErrors = status.errors.filter(
    (e) => Date.now() - new Date(e.timestamp).getTime() < 60_000, // Last 1 minute
  );

  if (recentErrors.length === 0 && status.consecutiveErrors > 0) {
    status.consecutiveErrors = 0;
    if (status.status === "degraded") {
      status.status = "healthy";
    }
  }

  return status;
}

/**
 * Get all plugin health statuses
 */
export function getAllPluginHealthStatuses(): PluginHealthStatus[] {
  const state = getPluginErrorState();
  return Array.from(state.healthStatus.values());
}

/**
 * Export error state for debugging
 */
export function exportPluginErrorState(): {
  errors: Array<[string, PluginError[]]>;
  healthStatus: Array<[string, PluginHealthStatus]>;
  backups: Array<[string, PluginBackup]>;
  disabledPlugins: string[];
} {
  const state = getPluginErrorState();
  return {
    errors: Array.from(state.errors.entries()),
    healthStatus: Array.from(state.healthStatus.entries()),
    backups: Array.from(state.backups.entries()),
    disabledPlugins: Array.from(state.disabledPlugins),
  };
}
