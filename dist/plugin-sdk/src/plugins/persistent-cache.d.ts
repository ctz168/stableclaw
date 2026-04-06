/**
 * Persistent plugin registry cache for fast startup.
 *
 * Instead of scanning all directories on every startup, we cache the discovery
 * results to disk and only re-scan when files change.
 */
import type { PluginDiscoveryResult } from "./discovery.js";
import type { PluginDiagnostic } from "./types.js";
export type PluginRegistryCache = {
    version: number;
    timestamp: number;
    candidates: Array<{
        idHint: string;
        source: string;
        rootDir: string;
        origin: string;
        manifestChecksum?: string;
        lastModified: number;
    }>;
    diagnostics: PluginDiagnostic[];
    roots: {
        stock?: string;
        global: string;
        workspace?: string;
    };
};
/**
 * Load the cache from disk.
 */
export declare function loadPersistentCache(env: NodeJS.ProcessEnv): PluginRegistryCache | null;
/**
 * Save the cache to disk.
 */
export declare function savePersistentCache(result: PluginDiscoveryResult, roots: {
    stock?: string;
    global: string;
    workspace?: string;
}, env: NodeJS.ProcessEnv): void;
/**
 * Check if the cache is still valid.
 * Returns true if the cache can be used, false if re-scan is needed.
 */
export declare function isCacheValid(cache: PluginRegistryCache, roots: {
    stock?: string;
    global: string;
    workspace?: string;
}): boolean;
/**
 * Convert cached candidates back to discovery result.
 */
export declare function cachedCandidatesToResult(cache: PluginRegistryCache): PluginDiscoveryResult;
/**
 * Clear the persistent cache.
 */
export declare function clearPersistentCache(env: NodeJS.ProcessEnv): void;
