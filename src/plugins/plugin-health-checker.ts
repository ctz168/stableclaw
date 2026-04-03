import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  getPluginHealthStatus,
  getAllPluginHealthStatuses,
  recordPluginError,
  enablePlugin,
} from "./plugin-error-handler.js";
import type { PluginHealthStatus } from "./plugin-error-handler.js";

const log = createSubsystemLogger("plugin-health");

/**
 * Plugin health checker configuration
 */
export type PluginHealthCheckerConfig = {
  checkIntervalMs: number;
  maxConsecutiveErrors: number;
  autoRecoveryEnabled: boolean;
};

/**
 * Plugin health checker
 * Periodically checks plugin health and attempts recovery
 */
export class PluginHealthChecker {
  private interval: NodeJS.Timeout | null = null;
  private config: PluginHealthCheckerConfig;
  private isRunning = false;

  constructor(config?: Partial<PluginHealthCheckerConfig>) {
    this.config = {
      checkIntervalMs: config?.checkIntervalMs ?? 60_000, // 1 minute
      maxConsecutiveErrors: config?.maxConsecutiveErrors ?? 3,
      autoRecoveryEnabled: config?.autoRecoveryEnabled ?? true,
    };
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.isRunning) {
      log.warn("Health checker already running");
      return;
    }

    log.info(
      `Starting plugin health checker (interval: ${this.config.checkIntervalMs}ms)`,
    );
    this.isRunning = true;

    // Run initial check
    this.runCheck().catch((err) => {
      log.error(`Health check failed: ${String(err)}`);
    });

    // Schedule periodic checks
    this.interval = setInterval(() => {
      this.runCheck().catch((err) => {
        log.error(`Health check failed: ${String(err)}`);
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop health checks
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    log.info("Stopping plugin health checker");
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
  }

  /**
   * Run a single health check
   */
  private async runCheck(): Promise<void> {
    const allStatuses = getAllPluginHealthStatuses();

    for (const [pluginId, status] of Object.entries(allStatuses)) {
      await this.checkPlugin(pluginId, status);
    }
  }

  /**
   * Check a single plugin's health
   */
  private async checkPlugin(
    pluginId: string,
    status: PluginHealthStatus,
  ): Promise<void> {
    // Skip healthy plugins
    if (status.status === "healthy") {
      return;
    }

    // Skip disabled plugins
    if (status.status === "disabled") {
      log.debug(`Plugin ${pluginId} is disabled, skipping health check`);
      return;
    }

    log.info(
      `Checking health of plugin ${pluginId} (status: ${status.status})`,
    );

    // Check for consecutive errors
    if (status.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      log.warn(
        `Plugin ${pluginId} has too many consecutive errors (${status.consecutiveErrors}), marking as failed`,
      );

      recordPluginError({
        pluginId,
        type: "runtime",
        severity: "critical",
        message: `Plugin failed after ${status.consecutiveErrors} consecutive errors`,
      });
      return;
    }

    // Attempt auto-recovery
    if (this.config.autoRecoveryEnabled && status.status === "degraded") {
      await this.attemptRecovery(pluginId);
    }
  }

  /**
   * Attempt to recover a degraded plugin
   */
  private async attemptRecovery(pluginId: string): Promise<void> {
    log.info(`Attempting to recover plugin ${pluginId}`);

    try {
      // Re-enable the plugin
      enablePlugin(pluginId);

      log.info(`Plugin ${pluginId} recovery attempt completed`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to recover plugin ${pluginId}: ${errorMsg}`);

      recordPluginError({
        pluginId,
        type: "runtime",
        severity: "error",
        message: `Recovery failed: ${errorMsg}`,
        error: error instanceof Error ? error : new Error(errorMsg),
      });
    }
  }

  /**
   * Get health status of all plugins
   */
  getStatus(): Record<string, PluginHealthStatus> {
    return getAllPluginHealthStatuses();
  }

  /**
   * Check if a specific plugin is healthy
   */
  isHealthy(pluginId: string): boolean {
    const status = getPluginHealthStatus(pluginId);
    return status?.status === "healthy";
  }
}

/**
 * Global health checker instance
 */
let globalHealthChecker: PluginHealthChecker | undefined;

export function getPluginHealthChecker(): PluginHealthChecker {
  if (!globalHealthChecker) {
    globalHealthChecker = new PluginHealthChecker();
  }
  return globalHealthChecker;
}

export function startPluginHealthChecker(
  config?: Partial<PluginHealthCheckerConfig>,
): PluginHealthChecker {
  const checker = getPluginHealthChecker();
  if (config) {
    checker["config"] = { ...checker["config"], ...config };
  }
  checker.start();
  return checker;
}

export function stopPluginHealthChecker(): void {
  getPluginHealthChecker().stop();
}
