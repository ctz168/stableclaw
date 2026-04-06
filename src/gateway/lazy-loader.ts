/**
 * Lazy Loader Helpers
 *
 * Convenience wrappers around the {@link lazyRegistry} singleton for the
 * most common registration and pre-fetching patterns.
 */

import { lazyRegistry } from "./lazy-registry.js";

// ---------------------------------------------------------------------------
// lazyImport
// ---------------------------------------------------------------------------

/**
 * Wrap a dynamic `import()` so it can be registered as a lazy module.
 *
 * ```ts
 * const getPlugins = lazyImport(() => import("./server-plugins.js"), "plugins");
 * // Equivalent to directly calling lazyRegistry.get("plugins")
 * const plugins = await getPlugins();
 * ```
 *
 * The module is **registered** the first time this helper is called for a
 * given `name`.  Subsequent calls return a new thunk that hits the same
 * cached entry.
 */
export function lazyImport<T>(
  importFn: () => Promise<T>,
  name: string,
): () => Promise<T> {
  // Register on first use (idempotent – throws if already registered with
  // a different init fn, which is intentional to catch mistakes).
  if (!lazyRegistry.listModules().includes(name)) {
    lazyRegistry.register(name, importFn);
  }
  return () => lazyRegistry.get<T>(name);
}

// ---------------------------------------------------------------------------
// lazyModule
// ---------------------------------------------------------------------------

/**
 * Register a module with a custom async initializer and return a thunk
 * that resolves to the initialised value.
 *
 * ```ts
 * const getCron = lazyModule("cron", async () => {
 *   const mod = await import("./server-cron.js");
 *   return mod.startCronService();
 * });
 * const service = await getCron();
 * ```
 */
export function lazyModule<T>(name: string, initFn: () => Promise<T>): () => Promise<T> {
  lazyRegistry.register(name, initFn);
  return () => lazyRegistry.get<T>(name);
}

// ---------------------------------------------------------------------------
// prefetchAll
// ---------------------------------------------------------------------------

/**
 * Kick off background initialisation for every module whose name is
 * provided.  Returns once all modules have settled (success or failure).
 *
 * ```ts
 * await prefetchAll(["cron", "discovery", "channels"]);
 * ```
 */
export async function prefetchAll(names: string[]): Promise<void> {
  await lazyRegistry.prefetchMany(names);
}
