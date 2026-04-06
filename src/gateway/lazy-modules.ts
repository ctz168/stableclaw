/**
 * Gateway Lazy Module Registrations
 *
 * Registers every heavy gateway subsystem as a lazy module so that none of
 * them are loaded at gateway boot.  Modules are only pulled in when a
 * consumer calls `lazyRegistry.get(name)`.
 *
 * Call {@link registerGatewayLazyModules} once during startup (after the
 * registry singleton has been created) to make all subsystem names
 * available.
 */

import { lazyRegistry } from "./lazy-registry.js";

/**
 * Register all heavy subsystems that should NOT load at gateway boot.
 *
 * This function is safe to call only once; a second invocation will throw
 * because every name is already present in the registry.
 */
export function registerGatewayLazyModules(): void {
  // Plugin loading
  lazyRegistry.register("plugins", () => import("./server-plugins.js").then((m) => m));

  // Channel management
  lazyRegistry.register("channels", () => import("./server-channels.js").then((m) => m));

  // Cron service
  lazyRegistry.register("cron", () => import("./server-cron.js").then((m) => m));

  // Discovery
  lazyRegistry.register("discovery", () => import("./server-discovery-runtime.js").then((m) => m));

  // Tailscale
  lazyRegistry.register("tailscale", () => import("./server-tailscale.js").then((m) => m));

  // Maintenance timers
  lazyRegistry.register("maintenance", () => import("./server-maintenance.js").then((m) => m));

  // Channel health monitor
  lazyRegistry.register("channel-health", () => import("./channel-health-monitor.js").then((m) => m));

  // Model pricing cache
  lazyRegistry.register("model-pricing", () => import("./model-pricing-cache.js").then((m) => m));

  // Config reloader
  lazyRegistry.register("config-reload", () => import("./config-reload.js").then((m) => m));

  // Task registry maintenance
  lazyRegistry.register(
    "task-registry",
    () => import("../tasks/task-registry.maintenance.js").then((m) => m),
  );

  // Canvas host
  lazyRegistry.register("canvas-host", () => import("../canvas-host/server.js").then((m) => m));

  // Memory backend
  lazyRegistry.register("memory", () => import("./server-startup-memory.js").then((m) => m));

  // Node subscriptions
  lazyRegistry.register(
    "node-subscriptions",
    () => import("./server-node-subscriptions.js").then((m) => m),
  );

  // Plugin services
  lazyRegistry.register("plugin-services", () => import("../plugins/services.js").then((m) => m));

  // Gmail watcher
  lazyRegistry.register(
    "gmail-watcher",
    () => import("../hooks/gmail-watcher-lifecycle.js").then((m) => m),
  );

  // Internal hooks
  lazyRegistry.register("hooks", () => import("../hooks/loader.js").then((m) => m));
}
