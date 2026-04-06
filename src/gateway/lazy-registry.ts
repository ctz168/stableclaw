/**
 * Lazy Module Registry
 *
 * Provides on-demand initialization of gateway subsystems. Modules are
 * registered with lazy init functions and only actually loaded when first
 * requested via `get()`.  Concurrent callers for the same module are
 * coalesced – the init function runs at most once and every waiter receives
 * the same result.
 *
 * Typical usage:
 *   lazyRegistry.register("cron", () => import("./server-cron.js"));
 *   const cronModule = await lazyRegistry.get("cron");
 */

import { createSubsystemLogger } from "../logging.js";

const log = createSubsystemLogger("gateway/lazy-registry");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result returned after a successful (or failed) lazy init. */
export type LazyInitResult<T = unknown> = {
  module: T;
  initTimeMs: number;
};

/** A function that performs the actual module initialisation. */
export type LazyInitFn<T = unknown> = () => Promise<T>;

/** Internal bookkeeping for a single lazy module. */
export type LazyModuleEntry<T = unknown> = {
  name: string;
  state: "pending" | "initializing" | "ready" | "failed";
  initFn: LazyInitFn<T>;
  result?: T;
  error?: Error;
  initTimeMs?: number;
  waiters: Array<{
    resolve: (result: LazyInitResult<T>) => void;
    reject: (error: Error) => void;
  }>;
};

/** Public status snapshot for observability / health endpoints. */
export type LazyModuleStatus = {
  name: string;
  state: string;
  initTimeMs?: number;
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class LazyModuleRegistry {
  private modules = new Map<string, LazyModuleEntry>();

  // ---- register ----------------------------------------------------------

  /**
   * Register a lazy module.
   *
   * @param name  - Unique identifier for the module (e.g. `"cron"`).
   * @param initFn - Async factory that resolves to the module value.
   * @throws If a module with the same name is already registered.
   */
  register<T>(name: string, initFn: LazyInitFn<T>): void {
    if (this.modules.has(name)) {
      throw new Error(`lazy-registry: module "${name}" is already registered`);
    }
    this.modules.set(name, {
      name,
      state: "pending",
      initFn,
      waiters: [],
    });
    log.debug(`registered lazy module: ${name}`);
  }

  // ---- get ---------------------------------------------------------------

  /**
   * Obtain a module, initialising it on the first call.
   *
   * If the module is already `ready` the cached result is returned
   * immediately.  If it is currently `initializing` the caller is queued
   * and will be resolved once the init completes.  If the previous init
   * `failed` the init function is **retried**.
   */
  async get<T>(name: string): Promise<T> {
    const entry = this.modules.get(name);
    if (!entry) {
      throw new Error(`lazy-registry: unknown module "${name}"`);
    }

    switch (entry.state) {
      // Already loaded – return cached value.
      case "ready":
        return entry.result as T;

      // Currently loading – piggyback on the in-flight init.
      case "initializing":
        return new Promise<T>((resolve, reject) => {
          entry.waiters.push({
            resolve: (r) => resolve(r.module as T),
            reject,
          });
        });

      // Previous attempt failed – retry from scratch.
      case "failed":
        log.debug(`retrying failed lazy module: ${name}`);
        break;

      // First call – kick off init.
      case "pending":
        break;
    }

    entry.state = "initializing";

    try {
      const start = performance.now();
      const moduleValue = await entry.initFn();
      const initTimeMs = performance.now() - start;

      entry.result = moduleValue;
      entry.initTimeMs = initTimeMs;
      entry.state = "ready";

      log.debug(`lazy module ready: ${name} (${initTimeMs.toFixed(1)}ms)`);

      // Resolve all waiters.
      const result: LazyInitResult = { module: moduleValue, initTimeMs };
      for (const w of entry.waiters) {
        w.resolve(result);
      }
      entry.waiters.length = 0;

      return moduleValue as T;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      entry.error = error;
      entry.state = "failed";

      log.debug(`lazy module failed: ${name}: ${error.message}`);

      // Reject all waiters.
      for (const w of entry.waiters) {
        w.reject(error);
      }
      entry.waiters.length = 0;

      throw error;
    }
  }

  // ---- isReady -----------------------------------------------------------

  /** Returns `true` if the module has been successfully initialised. */
  isReady(name: string): boolean {
    return this.modules.get(name)?.state === "ready";
  }

  // ---- listModules -------------------------------------------------------

  /** Returns the names of all registered modules (order is insertion order). */
  listModules(): string[] {
    return [...this.modules.keys()];
  }

  // ---- getStatus ---------------------------------------------------------

  /** Returns a status snapshot for every registered module. */
  getStatus(): LazyModuleStatus[] {
    return [...this.modules.values()].map((e) => ({
      name: e.name,
      state: e.state,
      initTimeMs: e.initTimeMs,
    }));
  }

  // ---- prefetch ----------------------------------------------------------

  /**
   * Start initialising a module in the background without awaiting it.
   *
   * Errors are swallowed (logged at debug level).  Use this for modules
   * you expect to need soon but don't need right now.
   */
  prefetch(name: string): void {
    void this.get(name).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.debug(`prefetch failed for "${name}": ${msg}`);
    });
  }

  // ---- prefetchMany ------------------------------------------------------

  /**
   * Initialise multiple modules in parallel.  The returned promise resolves
   * when *all* modules have finished (successfully or not).  Individual
   * failures are logged but do **not** reject the returned promise.
   */
  async prefetchMany(names: string[]): Promise<void> {
    await Promise.allSettled(
      names.map((name) =>
        this.get(name).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          log.debug(`prefetch-many failed for "${name}": ${msg}`);
        }),
      ),
    );
  }

  // ---- reset -------------------------------------------------------------

  /**
   * Drop all registered modules and reset the registry to its initial
   * state.  Intended for tests only.
   */
  reset(): void {
    // Reject any outstanding waiters so they don't hang forever.
    for (const entry of this.modules.values()) {
      if (entry.state === "initializing" && entry.waiters.length > 0) {
        const err = new Error(`lazy-registry: module "${entry.name}" reset while initializing`);
        for (const w of entry.waiters) {
          w.reject(err);
        }
      }
    }
    this.modules.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/** Global lazy module registry instance. */
export const lazyRegistry = new LazyModuleRegistry();
