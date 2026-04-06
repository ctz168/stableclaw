import { s as resolveEffectivePluginActivationState } from "./config-state-DfIk9ME6.js";
import { i as listBundledWebSearchProviders$1, n as sortWebSearchProviders, t as resolveBundledWebSearchResolutionConfig } from "./web-search-providers.shared-DE2avTwD.js";
//#region src/plugins/web-search-providers.ts
function listBundledWebSearchProviders() {
	return sortWebSearchProviders(listBundledWebSearchProviders$1());
}
function resolveBundledPluginWebSearchProviders(params) {
	const { config, normalized } = resolveBundledWebSearchResolutionConfig(params);
	const onlyPluginIdSet = params.onlyPluginIds && params.onlyPluginIds.length > 0 ? new Set(params.onlyPluginIds) : null;
	return listBundledWebSearchProviders().filter((provider) => {
		if (onlyPluginIdSet && !onlyPluginIdSet.has(provider.pluginId)) return false;
		return resolveEffectivePluginActivationState({
			id: provider.pluginId,
			origin: "bundled",
			config: normalized,
			rootConfig: config
		}).activated;
	});
}
//#endregion
export { resolveBundledPluginWebSearchProviders as t };
