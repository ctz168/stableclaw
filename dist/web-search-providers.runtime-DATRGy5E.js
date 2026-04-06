import { t as createSubsystemLogger } from "./subsystem-C9VSlEcV.js";
import { u as isRecord } from "./utils-CN_F_3Qg.js";
import { n as loadPluginManifestRegistry } from "./manifest-registry-Kx5Z2lJL.js";
import { i as resolveRuntimePluginRegistry, n as loadOpenClawPlugins, r as resolveCompatibleRuntimePluginRegistry } from "./loader-DsZDoLQ6.js";
import { t as createPluginLoaderLogger } from "./logger-CIV9WBoa.js";
import { n as sortWebSearchProviders, t as resolveBundledWebSearchResolutionConfig } from "./web-search-providers.shared-DE2avTwD.js";
import { n as resolvePluginSnapshotCacheTtlMs, r as shouldUsePluginSnapshotCache, t as buildPluginSnapshotCacheEnvKey } from "./cache-controls-DBdT4I-H.js";
//#region src/plugins/web-search-providers.runtime.ts
const log = createSubsystemLogger("plugins");
let webSearchProviderSnapshotCache = /* @__PURE__ */ new WeakMap();
function buildWebSearchSnapshotCacheKey(params) {
	return JSON.stringify({
		workspaceDir: params.workspaceDir ?? "",
		bundledAllowlistCompat: params.bundledAllowlistCompat === true,
		onlyPluginIds: [...new Set(params.onlyPluginIds ?? [])].toSorted((left, right) => left.localeCompare(right)),
		config: params.config ?? null,
		env: buildPluginSnapshotCacheEnvKey(params.env)
	});
}
function pluginManifestDeclaresWebSearch(record) {
	if ((record.contracts?.webSearchProviders?.length ?? 0) > 0) return true;
	if (Object.keys(record.configUiHints ?? {}).some((key) => key === "webSearch" || key.startsWith("webSearch."))) return true;
	if (!isRecord(record.configSchema)) return false;
	const properties = record.configSchema.properties;
	return isRecord(properties) && "webSearch" in properties;
}
function resolveWebSearchCandidatePluginIds(params) {
	const registry = loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	const onlyPluginIdSet = params.onlyPluginIds && params.onlyPluginIds.length > 0 ? new Set(params.onlyPluginIds) : null;
	const ids = registry.plugins.filter((plugin) => pluginManifestDeclaresWebSearch(plugin) && (!onlyPluginIdSet || onlyPluginIdSet.has(plugin.id))).map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
	return ids.length > 0 ? ids : void 0;
}
function resolveWebSearchLoadOptions(params) {
	const env = params.env ?? process.env;
	const { config, activationSourceConfig, autoEnabledReasons } = resolveBundledWebSearchResolutionConfig({
		...params,
		env
	});
	const onlyPluginIds = resolveWebSearchCandidatePluginIds({
		config,
		workspaceDir: params.workspaceDir,
		env,
		onlyPluginIds: params.onlyPluginIds
	});
	return {
		env,
		config,
		activationSourceConfig,
		autoEnabledReasons,
		workspaceDir: params.workspaceDir,
		cache: params.cache ?? false,
		activate: params.activate ?? false,
		...onlyPluginIds ? { onlyPluginIds } : {},
		logger: createPluginLoaderLogger(log)
	};
}
function mapRegistryWebSearchProviders(params) {
	const onlyPluginIdSet = params.onlyPluginIds && params.onlyPluginIds.length > 0 ? new Set(params.onlyPluginIds) : null;
	return sortWebSearchProviders(params.registry.webSearchProviders.filter((entry) => !onlyPluginIdSet || onlyPluginIdSet.has(entry.pluginId)).map((entry) => ({
		...entry.provider,
		pluginId: entry.pluginId
	})));
}
function resolvePluginWebSearchProviders(params) {
	const env = params.env ?? process.env;
	const cacheOwnerConfig = params.config;
	const shouldMemoizeSnapshot = params.activate !== true && params.cache !== true && shouldUsePluginSnapshotCache(env);
	const cacheKey = buildWebSearchSnapshotCacheKey({
		config: cacheOwnerConfig,
		workspaceDir: params.workspaceDir,
		bundledAllowlistCompat: params.bundledAllowlistCompat,
		onlyPluginIds: params.onlyPluginIds,
		env
	});
	if (cacheOwnerConfig && shouldMemoizeSnapshot) {
		const cached = (webSearchProviderSnapshotCache.get(cacheOwnerConfig)?.get(env))?.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) return cached.providers;
	}
	const loadOptions = resolveWebSearchLoadOptions(params);
	const resolved = mapRegistryWebSearchProviders({ registry: resolveCompatibleRuntimePluginRegistry(loadOptions) ?? loadOpenClawPlugins(loadOptions) });
	if (cacheOwnerConfig && shouldMemoizeSnapshot) {
		const ttlMs = resolvePluginSnapshotCacheTtlMs(env);
		let configCache = webSearchProviderSnapshotCache.get(cacheOwnerConfig);
		if (!configCache) {
			configCache = /* @__PURE__ */ new WeakMap();
			webSearchProviderSnapshotCache.set(cacheOwnerConfig, configCache);
		}
		let envCache = configCache.get(env);
		if (!envCache) {
			envCache = /* @__PURE__ */ new Map();
			configCache.set(env, envCache);
		}
		envCache.set(cacheKey, {
			expiresAt: Date.now() + ttlMs,
			providers: resolved
		});
	}
	return resolved;
}
function resolveRuntimeWebSearchProviders(params) {
	const runtimeRegistry = resolveRuntimePluginRegistry(params.config === void 0 ? void 0 : resolveWebSearchLoadOptions(params));
	if (runtimeRegistry) return mapRegistryWebSearchProviders({
		registry: runtimeRegistry,
		onlyPluginIds: params.onlyPluginIds
	});
	return resolvePluginWebSearchProviders(params);
}
//#endregion
export { resolveRuntimeWebSearchProviders as n, resolvePluginWebSearchProviders as t };
