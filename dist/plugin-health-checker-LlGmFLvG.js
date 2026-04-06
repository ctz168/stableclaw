import { t as createSubsystemLogger } from "./subsystem-C9VSlEcV.js";
import { i as getPluginHealthStatus, n as enablePlugin, o as recordPluginError, r as getAllPluginHealthStatuses, t as disablePlugin } from "./plugin-error-handler-DWUTf_UF.js";
//#region src/plugins/plugin-health-checker.ts
const log = createSubsystemLogger("plugin-health");
/**
* Plugin health checker
* Periodically checks plugin health and attempts recovery
*/
var PluginHealthChecker = class {
	constructor(config) {
		this.interval = null;
		this.isRunning = false;
		this.config = {
			checkIntervalMs: config?.checkIntervalMs ?? 1e4,
			maxConsecutiveErrors: config?.maxConsecutiveErrors ?? 3,
			autoRecoveryEnabled: config?.autoRecoveryEnabled ?? true
		};
	}
	/**
	* Start periodic health checks
	*/
	start() {
		if (this.isRunning) {
			log.warn("Health checker already running");
			return;
		}
		log.info(`Starting plugin health checker (interval: ${this.config.checkIntervalMs}ms)`);
		this.isRunning = true;
		this.runCheck().catch((err) => {
			log.error(`Health check failed: ${String(err)}`);
		});
		this.interval = setInterval(() => {
			this.runCheck().catch((err) => {
				log.error(`Health check failed: ${String(err)}`);
			});
		}, this.config.checkIntervalMs);
	}
	/**
	* Stop health checks
	*/
	stop() {
		if (!this.isRunning) return;
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
	async runCheck() {
		const allStatuses = getAllPluginHealthStatuses();
		for (const status of allStatuses) {
			const pluginId = status.pluginId;
			await this.checkPlugin(pluginId, status);
		}
	}
	/**
	* Check a single plugin's health
	*/
	async checkPlugin(pluginId, status) {
		if (status.status === "healthy") return;
		if (status.status === "disabled") {
			log.debug(`Plugin ${pluginId} is disabled, skipping health check`);
			return;
		}
		log.info(`Checking health of plugin ${pluginId} (status: ${status.status})`);
		if (status.consecutiveErrors >= this.config.maxConsecutiveErrors) {
			log.warn(`Plugin ${pluginId} has too many consecutive errors (${status.consecutiveErrors}), marking as failed`);
			recordPluginError({
				pluginId,
				type: "runtime",
				severity: "critical",
				message: `Plugin failed after ${status.consecutiveErrors} consecutive errors`
			});
			disablePlugin(pluginId, `Plugin failed after ${status.consecutiveErrors} consecutive errors`);
			return;
		}
		if (this.config.autoRecoveryEnabled && status.status === "degraded") await this.attemptRecovery(pluginId);
	}
	/**
	* Attempt to recover a degraded plugin
	*/
	async attemptRecovery(pluginId) {
		log.info(`Attempting to recover plugin ${pluginId}`);
		try {
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
				error: error instanceof Error ? error : new Error(errorMsg)
			});
		}
	}
	/**
	* Get health status of all plugins
	*/
	getStatus() {
		return getAllPluginHealthStatuses();
	}
	/**
	* Check if a specific plugin is healthy
	*/
	isHealthy(pluginId) {
		return getPluginHealthStatus(pluginId)?.status === "healthy";
	}
};
/**
* Global health checker instance
*/
let globalHealthChecker;
function getPluginHealthChecker() {
	if (!globalHealthChecker) globalHealthChecker = new PluginHealthChecker();
	return globalHealthChecker;
}
//#endregion
export { getPluginHealthChecker };
