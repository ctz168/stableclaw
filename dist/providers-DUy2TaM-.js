import { r as normalizeProviderId } from "./provider-id-CHzLB538.js";
import { a as normalizePluginsConfig, s as resolveEffectivePluginActivationState } from "./config-state-DfIk9ME6.js";
import { r as withBundledPluginVitestCompat } from "./bundled-compat-BLlVmkDi.js";
import { n as loadPluginManifestRegistry } from "./manifest-registry-Kx5Z2lJL.js";
//#region src/plugins/providers.ts
function withBundledProviderVitestCompat(params) {
	return withBundledPluginVitestCompat(params);
}
function resolveBundledProviderCompatPluginIds(params) {
	const onlyPluginIdSet = params.onlyPluginIds ? new Set(params.onlyPluginIds) : null;
	return loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	}).plugins.filter((plugin) => plugin.origin === "bundled" && plugin.providers.length > 0 && (!onlyPluginIdSet || onlyPluginIdSet.has(plugin.id))).map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
}
function resolveEnabledProviderPluginIds(params) {
	const onlyPluginIdSet = params.onlyPluginIds ? new Set(params.onlyPluginIds) : null;
	const registry = loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	const normalizedConfig = normalizePluginsConfig(params.config?.plugins);
	return registry.plugins.filter((plugin) => plugin.providers.length > 0 && (!onlyPluginIdSet || onlyPluginIdSet.has(plugin.id)) && resolveEffectivePluginActivationState({
		id: plugin.id,
		origin: plugin.origin,
		config: normalizedConfig,
		rootConfig: params.config
	}).activated).map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
}
function resolveOwningPluginIdsForProvider(params) {
	const normalizedProvider = normalizeProviderId(params.provider);
	if (!normalizedProvider) return;
	const pluginIds = loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	}).plugins.filter((plugin) => plugin.providers.some((providerId) => normalizeProviderId(providerId) === normalizedProvider)).map((plugin) => plugin.id);
	return pluginIds.length > 0 ? pluginIds : void 0;
}
function resolveCatalogHookProviderPluginIds(params) {
	const registry = loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	const normalizedConfig = normalizePluginsConfig(params.config?.plugins);
	const enabledProviderPluginIds = registry.plugins.filter((plugin) => plugin.providers.length > 0 && resolveEffectivePluginActivationState({
		id: plugin.id,
		origin: plugin.origin,
		config: normalizedConfig,
		rootConfig: params.config
	}).activated).map((plugin) => plugin.id);
	const bundledCompatPluginIds = resolveBundledProviderCompatPluginIds(params);
	return [...new Set([...enabledProviderPluginIds, ...bundledCompatPluginIds])].toSorted((left, right) => left.localeCompare(right));
}
//#endregion
export { withBundledProviderVitestCompat as a, resolveOwningPluginIdsForProvider as i, resolveCatalogHookProviderPluginIds as n, resolveEnabledProviderPluginIds as r, resolveBundledProviderCompatPluginIds as t };
