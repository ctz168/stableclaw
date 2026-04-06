import { t as createSubsystemLogger } from "./subsystem-C9VSlEcV.js";
import "node:fs/promises";
//#region src/plugins/plugin-error-handler.ts
const pluginLog = createSubsystemLogger("plugin");
const PLUGIN_ERROR_STATE = Symbol.for("openclaw.pluginErrorState");
function getPluginErrorState() {
	const globalState = globalThis;
	if (!globalState[PLUGIN_ERROR_STATE]) globalState[PLUGIN_ERROR_STATE] = {
		errors: /* @__PURE__ */ new Map(),
		healthStatus: /* @__PURE__ */ new Map(),
		backups: /* @__PURE__ */ new Map(),
		disabledPlugins: /* @__PURE__ */ new Set()
	};
	return globalState[PLUGIN_ERROR_STATE];
}
/**
* Record a plugin error
*/
function recordPluginError(params) {
	const state = getPluginErrorState();
	const pluginError = {
		pluginId: params.pluginId,
		type: params.type,
		severity: params.severity,
		message: params.message,
		error: params.error,
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		stack: params.error?.stack
	};
	let pluginErrors = state.errors.get(params.pluginId);
	if (!pluginErrors) {
		pluginErrors = [];
		state.errors.set(params.pluginId, pluginErrors);
	}
	pluginErrors.push(pluginError);
	if (pluginErrors.length > 10) pluginErrors.shift();
	updatePluginHealthStatus(params.pluginId, pluginError);
	pluginLog.error(`[plugin-error] ${params.pluginId} (${params.type}/${params.severity}): ${params.message}`);
	return pluginError;
}
/**
* Update plugin health status
*/
function updatePluginHealthStatus(pluginId, error) {
	const state = getPluginErrorState();
	let status = state.healthStatus.get(pluginId);
	if (!status) {
		status = {
			pluginId,
			status: "healthy",
			lastCheck: (/* @__PURE__ */ new Date()).toISOString(),
			errors: [],
			consecutiveErrors: 0
		};
		state.healthStatus.set(pluginId, status);
	}
	status.lastCheck = (/* @__PURE__ */ new Date()).toISOString();
	status.errors.push(error);
	status.lastError = error;
	status.consecutiveErrors += 1;
	if (status.consecutiveErrors >= 3 || error.severity === "critical") status.status = "failed";
	else if (status.consecutiveErrors >= 1) status.status = "degraded";
}
/**
* Disable a plugin
*/
function disablePlugin(pluginId, reason) {
	const state = getPluginErrorState();
	state.disabledPlugins.add(pluginId);
	pluginLog.warn(`[plugin-disable] ${pluginId} disabled: ${reason}`);
	const status = state.healthStatus.get(pluginId);
	if (status) status.status = "disabled";
}
/**
* Enable a plugin
*/
function enablePlugin(pluginId) {
	const state = getPluginErrorState();
	state.disabledPlugins.delete(pluginId);
	const status = state.healthStatus.get(pluginId);
	if (status) {
		status.status = "healthy";
		status.consecutiveErrors = 0;
		status.errors = [];
		status.lastError = void 0;
	}
	pluginLog.info(`[plugin-enable] ${pluginId} enabled`);
}
/**
* Check if a plugin is disabled
*/
function isPluginDisabled(pluginId) {
	return getPluginErrorState().disabledPlugins.has(pluginId);
}
/**
* Get plugin health status
*/
function getPluginHealthStatus(pluginId) {
	return getPluginErrorState().healthStatus.get(pluginId);
}
/**
* Get all plugin health statuses
*/
function getAllPluginHealthStatuses() {
	const state = getPluginErrorState();
	return Array.from(state.healthStatus.values());
}
//#endregion
export { isPluginDisabled as a, getPluginHealthStatus as i, enablePlugin as n, recordPluginError as o, getAllPluginHealthStatuses as r, disablePlugin as t };
