import { t as createSubsystemLogger } from "./subsystem-C9VSlEcV.js";
import { o as recordPluginError, t as disablePlugin } from "./plugin-error-handler-DWUTf_UF.js";
//#region src/plugins/plugin-error-boundary.ts
const log = createSubsystemLogger("plugin-error-boundary");
/**
* Setup global error handlers for uncaught plugin errors
*/
function setupGlobalPluginErrorHandlers() {
	process.on("uncaughtException", (error) => {
		const errorMsg = error.message || String(error);
		log.error(`Uncaught exception: ${errorMsg}`);
		const pluginId = extractPluginIdFromError(error);
		if (pluginId) {
			recordPluginError({
				pluginId,
				type: "runtime",
				severity: "critical",
				message: `Uncaught exception: ${errorMsg}`,
				error
			});
			disablePlugin(pluginId, `Uncaught exception: ${errorMsg}`);
		}
	});
	process.on("unhandledRejection", (reason) => {
		const errorMsg = reason instanceof Error ? reason.message : String(reason);
		log.error(`Unhandled rejection: ${errorMsg}`);
		const error = reason instanceof Error ? reason : new Error(String(reason));
		const pluginId = extractPluginIdFromError(error);
		if (pluginId) {
			recordPluginError({
				pluginId,
				type: "runtime",
				severity: "critical",
				message: `Unhandled rejection: ${errorMsg}`,
				error
			});
			disablePlugin(pluginId, `Unhandled rejection: ${errorMsg}`);
		}
	});
	log.info("Global plugin error handlers installed");
}
/**
* Extract plugin ID from error stack trace or message
*/
function extractPluginIdFromError(error) {
	const stack = error.stack || "";
	const message = error.message || "";
	const pluginPathMatch = stack.match(/\/plugins\/([^/]+)\//) || stack.match(/\/extensions\/([^/]+)\//);
	if (pluginPathMatch) return pluginPathMatch[1] || null;
	const pluginMessageMatch = message.match(/Plugin\s+['"]([^'"]+)['"]/);
	if (pluginMessageMatch) return pluginMessageMatch[1] || null;
	return null;
}
//#endregion
export { setupGlobalPluginErrorHandlers };
