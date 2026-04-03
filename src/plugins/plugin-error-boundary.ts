import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  recordPluginError,
  isPluginDisabled,
  disablePlugin,
} from "./plugin-error-handler.js";

const log = createSubsystemLogger("plugin-error-boundary");

/**
 * Error boundary for plugin operations
 * Wraps plugin function calls with error handling and isolation
 */
export class PluginErrorBoundary {
  /**
   * Wrap a plugin function call with error handling
   */
  static async wrap<T>(
    pluginId: string,
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    // Check if plugin is disabled
    if (isPluginDisabled(pluginId)) {
      log.debug(`Plugin ${pluginId} is disabled, skipping ${operation}`);
      return undefined;
    }

    try {
      return await fn();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Plugin ${pluginId} error in ${operation}: ${errorMsg}`);

      // Record the error
      recordPluginError({
        pluginId,
        type: "runtime",
        severity: "error",
        message: `${operation} failed: ${errorMsg}`,
        error: error instanceof Error ? error : new Error(errorMsg),
      });

      // Disable the plugin (strict mode)
      disablePlugin(pluginId, `Error in ${operation}: ${errorMsg}`);

      return undefined;
    }
  }

  /**
   * Wrap a sync plugin function call with error handling
   */
  static wrapSync<T>(pluginId: string, operation: string, fn: () => T): T | undefined {
    // Check if plugin is disabled
    if (isPluginDisabled(pluginId)) {
      log.debug(`Plugin ${pluginId} is disabled, skipping ${operation}`);
      return undefined;
    }

    try {
      return fn();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Plugin ${pluginId} error in ${operation}: ${errorMsg}`);

      // Record the error
      recordPluginError({
        pluginId,
        type: "runtime",
        severity: "error",
        message: `${operation} failed: ${errorMsg}`,
        error: error instanceof Error ? error : new Error(errorMsg),
      });

      // Disable the plugin (strict mode)
      disablePlugin(pluginId, `Error in ${operation}: ${errorMsg}`);

      return undefined;
    }
  }
}

/**
 * Convenience function to wrap plugin operations
 */
export async function withPluginErrorHandling<T>(
  pluginId: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  return PluginErrorBoundary.wrap(pluginId, operation, fn);
}

/**
 * Setup global error handlers for uncaught plugin errors
 */
export function setupGlobalPluginErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    const errorMsg = error.message || String(error);
    log.error(`Uncaught exception: ${errorMsg}`);

    // Check if error is from a plugin
    const pluginId = extractPluginIdFromError(error);
    if (pluginId) {
      recordPluginError({
        pluginId,
        type: "runtime",
        severity: "critical",
        message: `Uncaught exception: ${errorMsg}`,
        error,
      });

      disablePlugin(pluginId, `Uncaught exception: ${errorMsg}`);
    }
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason) => {
    const errorMsg = reason instanceof Error ? reason.message : String(reason);
    log.error(`Unhandled rejection: ${errorMsg}`);

    // Check if rejection is from a plugin
    const error = reason instanceof Error ? reason : new Error(String(reason));
    const pluginId = extractPluginIdFromError(error);
    if (pluginId) {
      recordPluginError({
        pluginId,
        type: "runtime",
        severity: "critical",
        message: `Unhandled rejection: ${errorMsg}`,
        error,
      });

      disablePlugin(pluginId, `Unhandled rejection: ${errorMsg}`);
    }
  });

  log.info("Global plugin error handlers installed");
}

/**
 * Extract plugin ID from error stack trace or message
 */
function extractPluginIdFromError(error: Error): string | null {
  const stack = error.stack || "";
  const message = error.message || "";

  // Try to extract plugin ID from stack trace
  // Look for patterns like:
  // - "at Object.<anonymous> (/path/to/plugins/my-plugin/...)"
  // - "at Object.<anonymous> (/path/to/extensions/my-plugin/...)"
  const pluginPathMatch = stack.match(
    /\/plugins\/([^/]+)\//,
  ) || stack.match(/\/extensions\/([^/]+)\//);

  if (pluginPathMatch) {
    return pluginPathMatch[1] || null;
  }

  // Try to extract from error message
  // Look for patterns like:
  // - "Plugin 'my-plugin' error: ..."
  const pluginMessageMatch = message.match(/Plugin\s+['"]([^'"]+)['"]/);
  if (pluginMessageMatch) {
    return pluginMessageMatch[1] || null;
  }

  return null;
}
