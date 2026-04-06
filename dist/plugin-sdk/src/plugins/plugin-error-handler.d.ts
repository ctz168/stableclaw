/**
 * Plugin error types
 */
export type PluginErrorType = "load" | "runtime" | "hook" | "channel" | "provider" | "tool" | "command";
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
 * Record a plugin error
 */
export declare function recordPluginError(params: {
    pluginId: string;
    type: PluginErrorType;
    severity: PluginErrorSeverity;
    message: string;
    error?: Error;
}): PluginError;
/**
 * Disable a plugin
 */
export declare function disablePlugin(pluginId: string, reason: string): void;
/**
 * Enable a plugin
 */
export declare function enablePlugin(pluginId: string): void;
/**
 * Check if a plugin is disabled
 */
export declare function isPluginDisabled(pluginId: string): boolean;
/**
 * Get plugin health status
 */
export declare function getPluginHealthStatus(pluginId: string): PluginHealthStatus | undefined;
/**
 * Get all disabled plugins
 */
export declare function getDisabledPlugins(): string[];
/**
 * Get plugin errors
 */
export declare function getPluginErrors(pluginId: string): PluginError[];
/**
 * Clear plugin errors
 */
export declare function clearPluginErrors(pluginId: string): void;
/**
 * Create plugin backup for rollback
 */
export declare function createPluginBackup(params: {
    pluginId: string;
    version?: string;
    installPath: string;
    config?: Record<string, unknown>;
    manifestPath?: string;
}): Promise<PluginBackup>;
/**
 * Get plugin backup
 */
export declare function getPluginBackup(pluginId: string): PluginBackup | undefined;
/**
 * Rollback plugin to last known good version
 */
export declare function rollbackPlugin(params: {
    pluginId: string;
    reason: string;
}): Promise<{
    success: boolean;
    backup?: PluginBackup;
    error?: string;
}>;
/**
 * Wrap plugin operation with error handling
 */
export declare function withPluginErrorHandling<T>(pluginId: string, operation: string, fn: () => Promise<T>): Promise<T | undefined>;
/**
 * Wrap plugin hook with error handling
 */
export declare function wrapPluginHook<TArgs extends unknown[], TResult>(pluginId: string, hookName: string, hook: (...args: TArgs) => Promise<TResult>): (...args: TArgs) => Promise<TResult | undefined>;
/**
 * Check plugin health
 */
export declare function checkPluginHealth(pluginId: string): Promise<PluginHealthStatus>;
/**
 * Get all plugin health statuses
 */
export declare function getAllPluginHealthStatuses(): PluginHealthStatus[];
/**
 * Export error state for debugging
 */
export declare function exportPluginErrorState(): {
    errors: Array<[string, PluginError[]]>;
    healthStatus: Array<[string, PluginHealthStatus]>;
    backups: Array<[string, PluginBackup]>;
    disabledPlugins: string[];
};
