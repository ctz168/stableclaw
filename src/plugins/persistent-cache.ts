/**
 * Persistent plugin registry cache for fast startup.
 * 
 * Instead of scanning all directories on every startup, we cache the discovery
 * results to disk and only re-scan when files change.
 */

import fs from "node:fs";
import path from "node:path";
import type { PluginCandidate, PluginDiscoveryResult } from "./discovery.js";
import type { PluginDiagnostic } from "./types.js";

const CACHE_VERSION = 1;
const CACHE_FILENAME = "plugin-registry-cache.json";

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
 * Resolve the cache file path.
 */
function resolveCacheFilePath(env: NodeJS.ProcessEnv): string {
  // Use OPENCLAW_STATE_DIR or default to ~/.openclaw
  const stateDir = env.OPENCLAW_STATE_DIR?.trim() || 
    (process.platform === "win32" 
      ? path.join(env.USERPROFILE || env.HOME || "", ".openclaw")
      : path.join(env.HOME || "", ".openclaw"));
  
  // Ensure directory exists
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  
  return path.join(stateDir, CACHE_FILENAME);
}

/**
 * Calculate a simple checksum for a manifest file.
 */
function calculateManifestChecksum(manifestPath: string): string | undefined {
  try {
    const stat = fs.statSync(manifestPath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return undefined;
  }
}

/**
 * Load the cache from disk.
 */
export function loadPersistentCache(env: NodeJS.ProcessEnv): PluginRegistryCache | null {
  try {
    const cachePath = resolveCacheFilePath(env);
    if (!fs.existsSync(cachePath)) {
      return null;
    }
    
    const content = fs.readFileSync(cachePath, "utf-8");
    const cache = JSON.parse(content) as PluginRegistryCache;
    
    // Validate version
    if (cache.version !== CACHE_VERSION) {
      return null;
    }
    
    return cache;
  } catch (error) {
    // Invalid cache, ignore
    return null;
  }
}

/**
 * Save the cache to disk.
 */
export function savePersistentCache(
  result: PluginDiscoveryResult,
  roots: { stock?: string; global: string; workspace?: string },
  env: NodeJS.ProcessEnv
): void {
  try {
    const cachePath = resolveCacheFilePath(env);
    
    // Add checksums and timestamps to candidates
    const cachedCandidates = result.candidates.map(candidate => ({
      idHint: candidate.idHint,
      source: candidate.source,
      rootDir: candidate.rootDir,
      origin: candidate.origin,
      manifestChecksum: calculateManifestChecksum(
        path.join(candidate.rootDir, "openclaw.plugin.json")
      ),
      lastModified: Date.now(),
    }));
    
    const cache: PluginRegistryCache = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      candidates: cachedCandidates,
      diagnostics: result.diagnostics,
      roots,
    };
    
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf-8");
  } catch (error) {
    // Failed to save cache, ignore (non-critical)
  }
}

/**
 * Check if the cache is still valid.
 * Returns true if the cache can be used, false if re-scan is needed.
 */
export function isCacheValid(
  cache: PluginRegistryCache,
  roots: { stock?: string; global: string; workspace?: string }
): boolean {
  // Check if roots match
  if (cache.roots.stock !== roots.stock ||
      cache.roots.global !== roots.global ||
      cache.roots.workspace !== roots.workspace) {
    return false;
  }
  
  // Check if any manifest files have changed
  for (const cached of cache.candidates) {
    const manifestPath = path.join(cached.rootDir, "openclaw.plugin.json");
    const currentChecksum = calculateManifestChecksum(manifestPath);
    
    // If manifest file changed or doesn't exist, cache is invalid
    if (currentChecksum !== cached.manifestChecksum) {
      return false;
    }
  }
  
  return true;
}

/**
 * Convert cached candidates back to discovery result.
 */
export function cachedCandidatesToResult(cache: PluginRegistryCache): PluginDiscoveryResult {
  const candidates: PluginCandidate[] = cache.candidates.map(cached => ({
    idHint: cached.idHint,
    source: cached.source,
    rootDir: cached.rootDir,
    origin: cached.origin as PluginCandidate["origin"],
  }));
  
  return {
    candidates,
    diagnostics: cache.diagnostics,
  };
}

/**
 * Clear the persistent cache.
 */
export function clearPersistentCache(env: NodeJS.ProcessEnv): void {
  try {
    const cachePath = resolveCacheFilePath(env);
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  } catch (error) {
    // Ignore errors
  }
}
