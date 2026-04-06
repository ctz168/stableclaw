import { t as createSubsystemLogger } from "./subsystem-C9VSlEcV.js";
import { r as getActivePluginRegistry, v as setActivePluginRegistry } from "./runtime-B8hqEtu6.js";
import { a as isPluginDisabled, n as enablePlugin, o as recordPluginError } from "./plugin-error-handler-DWUTf_UF.js";
//#region src/plugins/plugin-hot-reload.ts
const log = createSubsystemLogger("plugin-hot-reload");
/** Filter out registrations belonging to a specific plugin. */
const filterByPlugin = (items, pluginId) => items.filter((item) => item.pluginId !== pluginId);
/**
* Plugin hot reload manager.
* Handles loading, unloading, and reloading plugins without restarting gateway.
*/
var PluginHotReloadManager = class {
	constructor() {
		this.lock = Promise.resolve();
	}
	async withLock(fn) {
		const previous = this.lock;
		let resolveLock;
		this.lock = new Promise((r) => {
			resolveLock = r;
		});
		await previous;
		try {
			return await fn();
		} finally {
			resolveLock();
		}
	}
	/**
	* Load a newly installed plugin.
	*
	* Creates a registration-stage record in the active registry so that the
	* plugin is visible to the system immediately.  Full initialisation (manifest
	* parsing, dependency resolution, hook registration, etc.) happens on the
	* next gateway restart via the normal loader pipeline.
	*/
	async loadNewPlugin(params) {
		return this.withLock(() => this.loadNewPluginInternal(params));
	}
	/**
	* Unload a plugin before uninstalling.
	*
	* Removes the plugin's `PluginRecord` **and** every registration (tools,
	* hooks, channels, providers, gateway methods, …) that references its id.
	*/
	async unloadPlugin(params) {
		return this.withLock(() => this.unloadPluginInternal(params));
	}
	/**
	* Reload a plugin (e.g. after an update).
	*
	* Runs unload → load inside a **single** lock acquisition to avoid the
	* deadlock that would result from calling the public `unloadPlugin` /
	* `loadNewPlugin` methods (each of which acquires the same lock).
	*/
	async reloadPlugin(params) {
		return this.withLock(async () => {
			const unloadResult = await this.unloadPluginInternal(params);
			if (!unloadResult.ok) return unloadResult;
			return this.loadNewPluginInternal(params);
		});
	}
	getActivePluginCount() {
		const registry = getActivePluginRegistry();
		return registry ? registry.plugins.length : 0;
	}
	isPluginLoaded(pluginId) {
		const registry = getActivePluginRegistry();
		return registry ? registry.plugins.some((p) => p.id === pluginId) : false;
	}
	async loadNewPluginInternal(params) {
		const { pluginId, installPath } = params;
		log.info(`Loading newly installed plugin: ${pluginId}`);
		if (isPluginDisabled(pluginId)) {
			log.warn(`Plugin ${pluginId} is disabled, skipping load`);
			return {
				ok: false,
				error: `Plugin ${pluginId} is disabled due to previous errors. Enable it first.`
			};
		}
		try {
			const currentRegistry = getActivePluginRegistry();
			if (!currentRegistry) return {
				ok: false,
				error: "No active plugin registry found"
			};
			if (currentRegistry.plugins.some((p) => p.id === pluginId)) {
				log.warn(`Plugin ${pluginId} already loaded, skipping`);
				return { ok: true };
			}
			let newRecord;
			try {
				const pluginName = (await import(installPath).catch(() => null))?.default?.name ?? pluginId;
				newRecord = {
					id: pluginId,
					name: pluginName,
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
					configSchema: false
				};
				log.info(`Plugin ${pluginId} (${pluginName}) hot-loaded from ${installPath}`);
			} catch (_manifestErr) {
				log.info(`Plugin ${pluginId} manifest not available; using placeholder`);
				newRecord = {
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
					configSchema: false
				};
			}
			setActivePluginRegistry({
				...currentRegistry,
				plugins: [...currentRegistry.plugins, newRecord]
			});
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
				error: error instanceof Error ? error : new Error(errorMsg)
			});
			return {
				ok: false,
				error: errorMsg
			};
		}
	}
	async unloadPluginInternal(params) {
		const { pluginId } = params;
		log.info(`Unloading plugin: ${pluginId}`);
		try {
			const currentRegistry = getActivePluginRegistry();
			if (!currentRegistry) return {
				ok: false,
				error: "No active plugin registry found"
			};
			const pluginRecord = currentRegistry.plugins.find((p) => p.id === pluginId);
			if (!pluginRecord) {
				log.warn(`Plugin ${pluginId} not found in registry, skipping unload`);
				return { ok: true };
			}
			const cleanedGatewayHandlers = { ...currentRegistry.gatewayHandlers };
			for (const method of pluginRecord.gatewayMethods) delete cleanedGatewayHandlers[method];
			let cleanedMethodScopes;
			if (currentRegistry.gatewayMethodScopes) {
				const scopes = { ...currentRegistry.gatewayMethodScopes };
				for (const method of pluginRecord.gatewayMethods) delete scopes[method];
				cleanedMethodScopes = Object.keys(scopes).length > 0 ? scopes : void 0;
			}
			setActivePluginRegistry({
				plugins: currentRegistry.plugins.filter((p) => p.id !== pluginId),
				tools: filterByPlugin(currentRegistry.tools, pluginId),
				hooks: filterByPlugin(currentRegistry.hooks, pluginId),
				typedHooks: filterByPlugin(currentRegistry.typedHooks, pluginId),
				channels: filterByPlugin(currentRegistry.channels, pluginId),
				channelSetups: filterByPlugin(currentRegistry.channelSetups, pluginId),
				providers: filterByPlugin(currentRegistry.providers, pluginId),
				cliBackends: currentRegistry.cliBackends ? filterByPlugin(currentRegistry.cliBackends, pluginId) : currentRegistry.cliBackends,
				speechProviders: filterByPlugin(currentRegistry.speechProviders, pluginId),
				mediaUnderstandingProviders: filterByPlugin(currentRegistry.mediaUnderstandingProviders, pluginId),
				imageGenerationProviders: filterByPlugin(currentRegistry.imageGenerationProviders, pluginId),
				webFetchProviders: filterByPlugin(currentRegistry.webFetchProviders, pluginId),
				webSearchProviders: filterByPlugin(currentRegistry.webSearchProviders, pluginId),
				gatewayHandlers: cleanedGatewayHandlers,
				gatewayMethodScopes: cleanedMethodScopes,
				httpRoutes: currentRegistry.httpRoutes.filter((r) => r.pluginId !== pluginId),
				cliRegistrars: filterByPlugin(currentRegistry.cliRegistrars, pluginId),
				services: filterByPlugin(currentRegistry.services, pluginId),
				commands: filterByPlugin(currentRegistry.commands, pluginId),
				conversationBindingResolvedHandlers: filterByPlugin(currentRegistry.conversationBindingResolvedHandlers, pluginId),
				diagnostics: currentRegistry.diagnostics.filter((d) => d.pluginId !== pluginId)
			});
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
				error: error instanceof Error ? error : new Error(errorMsg)
			});
			return {
				ok: false,
				error: errorMsg
			};
		}
	}
};
let globalHotReloadManager;
function getPluginHotReloadManager() {
	if (!globalHotReloadManager) globalHotReloadManager = new PluginHotReloadManager();
	return globalHotReloadManager;
}
async function loadNewPlugin(params) {
	return getPluginHotReloadManager().loadNewPlugin(params);
}
async function unloadPlugin(params) {
	return getPluginHotReloadManager().unloadPlugin(params);
}
//#endregion
export { loadNewPlugin, unloadPlugin };
