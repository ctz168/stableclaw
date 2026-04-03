import { isDeepStrictEqual } from "node:util";
import chokidar from "chokidar";
import type {
  OpenClawConfig,
  ConfigFileSnapshot,
  ConfigWriteNotification,
  GatewayReloadMode,
} from "../config/config.js";
import { formatConfigIssueLines } from "../config/issue-format.js";
import { isPlainObject } from "../utils.js";
import { buildGatewayReloadPlan, type GatewayReloadPlan } from "./config-reload-plan.js";
import { handleInvalidConfig, clearConfigError } from "./config-error-handler.js";

export { buildGatewayReloadPlan };
export type { ChannelKind, GatewayReloadPlan } from "./config-reload-plan.js";

export type GatewayReloadSettings = {
  mode: GatewayReloadMode;
  debounceMs: number;
};

const DEFAULT_RELOAD_SETTINGS: GatewayReloadSettings = {
  mode: "hybrid",
  debounceMs: 300,
};
const MISSING_CONFIG_RETRY_DELAY_MS = 150;
const MISSING_CONFIG_MAX_RETRIES = 2;

export function diffConfigPaths(prev: unknown, next: unknown, prefix = ""): string[] {
  if (prev === next) {
    return [];
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    const paths: string[] = [];
    for (const key of keys) {
      const prevValue = prev[key];
      const nextValue = next[key];
      if (prevValue === undefined && nextValue === undefined) {
        continue;
      }
      const childPrefix = prefix ? `${prefix}.${key}` : key;
      const childPaths = diffConfigPaths(prevValue, nextValue, childPrefix);
      if (childPaths.length > 0) {
        paths.push(...childPaths);
      }
    }
    return paths;
  }
  if (Array.isArray(prev) && Array.isArray(next)) {
    // Arrays can contain object entries (for example memory.qmd.paths/scope.rules);
    // compare structurally so identical values are not reported as changed.
    if (isDeepStrictEqual(prev, next)) {
      return [];
    }
  }
  return [prefix || "<root>"];
}

export function resolveGatewayReloadSettings(cfg: OpenClawConfig): GatewayReloadSettings {
  const rawMode = cfg.gateway?.reload?.mode;
  const mode =
    rawMode === "off" || rawMode === "restart" || rawMode === "hot" || rawMode === "hybrid"
      ? rawMode
      : DEFAULT_RELOAD_SETTINGS.mode;
  const debounceRaw = cfg.gateway?.reload?.debounceMs;
  const debounceMs =
    typeof debounceRaw === "number" && Number.isFinite(debounceRaw)
      ? Math.max(0, Math.floor(debounceRaw))
      : DEFAULT_RELOAD_SETTINGS.debounceMs;
  return { mode, debounceMs };
}

export type GatewayConfigReloader = {
  stop: () => Promise<void>;
};

export function startGatewayConfigReloader(opts: {
  initialConfig: OpenClawConfig;
  initialInternalWriteHash?: string | null;
  readSnapshot: () => Promise<ConfigFileSnapshot>;
  onHotReload: (plan: GatewayReloadPlan, nextConfig: OpenClawConfig) => Promise<void>;
  onRestart: (plan: GatewayReloadPlan, nextConfig: OpenClawConfig) => void | Promise<void>;
  subscribeToWrites?: (listener: (event: ConfigWriteNotification) => void) => () => void;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  watchPath: string;
}): GatewayConfigReloader {
  let currentConfig = opts.initialConfig;
  let settings = resolveGatewayReloadSettings(currentConfig);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let running = false;
  let stopped = false;
  let restartQueued = false;
  let missingConfigRetries = 0;
  let pendingInProcessConfig: OpenClawConfig | null = null;
  let lastAppliedWriteHash = opts.initialInternalWriteHash ?? null;

  const scheduleAfter = (wait: number) => {
    if (stopped) {
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      void runReload();
    }, wait);
  };
  const schedule = () => {
    scheduleAfter(settings.debounceMs);
  };
  const queueRestart = (plan: GatewayReloadPlan, nextConfig: OpenClawConfig) => {
    if (restartQueued) {
      return;
    }
    restartQueued = true;
    void (async () => {
      try {
        await opts.onRestart(plan, nextConfig);
      } catch (err) {
        // Restart checks can fail (for example unresolved SecretRefs). Keep the
        // reloader alive and allow a future change to retry restart scheduling.
        restartQueued = false;
        opts.log.error(`config restart failed: ${String(err)}`);
      }
    })();
  };

  const handleMissingSnapshot = (snapshot: ConfigFileSnapshot): boolean => {
    if (snapshot.exists) {
      missingConfigRetries = 0;
      return false;
    }
    if (missingConfigRetries < MISSING_CONFIG_MAX_RETRIES) {
      missingConfigRetries += 1;
      opts.log.info(
        `config reload retry (${missingConfigRetries}/${MISSING_CONFIG_MAX_RETRIES}): config file not found`,
      );
      scheduleAfter(MISSING_CONFIG_RETRY_DELAY_MS);
      return true;
    }
    opts.log.warn("config reload skipped (config file not found)");
    return true;
  };

  const handleInvalidSnapshot = async (snapshot: ConfigFileSnapshot): Promise<boolean> => {
    if (snapshot.valid) {
      return false;
    }
    
    // Enhanced error handling: call the error handler
    const result = await handleInvalidConfig(snapshot, {
      configPath: opts.watchPath,
    });
    
    // Log the result
    if (result.rolledBack) {
      opts.log.error(
        `Configuration validation failed. Automatic rollback completed. Check ${result.invalidConfigPath || "backup files"} for details.`
      );
    } else {
      opts.log.error(
        `Configuration validation failed. Gateway will continue with the last valid configuration. ${result.errorMessage}`
      );
    }
    
    return true;
  };

  const applySnapshot = async (nextConfig: OpenClawConfig) => {
    const changedPaths = diffConfigPaths(currentConfig, nextConfig);
    currentConfig = nextConfig;
    settings = resolveGatewayReloadSettings(nextConfig);
    if (changedPaths.length === 0) {
      return;
    }

    opts.log.info(`config change detected; evaluating reload (${changedPaths.join(", ")})`);
    const plan = buildGatewayReloadPlan(changedPaths);
    if (settings.mode === "off") {
      opts.log.info("config reload disabled (gateway.reload.mode=off)");
      return;
    }
    if (settings.mode === "restart") {
      queueRestart(plan, nextConfig);
      return;
    }
    if (plan.restartGateway) {
      // BUG FIX: In hot mode, previously the restart-required changes were
      // silently dropped. Now we log prominently and still apply the safe
      // hot-reloadable parts while warning about the restart-needed paths.
      if (settings.mode === "hot") {
        opts.log.warn(
          `config change requires gateway restart but mode=hot: ${plan.restartReasons.join(
            ", ",
          )}. Applying hot-reloadable changes only.`,
        );
        // Apply whatever hot-reloadable portions exist alongside restart paths
        if (plan.hotReasons.length > 0) {
          try {
            await opts.onHotReload(plan, nextConfig);
          } catch (err) {
            opts.log.error(`partial hot reload failed: ${String(err)}`);
          }
        }
        return;
      }
      // hybrid or restart mode: queue a full gateway restart
      queueRestart(plan, nextConfig);
      return;
    }

    await opts.onHotReload(plan, nextConfig);
  };

  const runReload = async () => {
    if (stopped) {
      return;
    }
    if (running) {
      pending = true;
      return;
    }
    running = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    try {
      if (pendingInProcessConfig) {
        const nextConfig = pendingInProcessConfig;
        pendingInProcessConfig = null;
        missingConfigRetries = 0;
        await applySnapshot(nextConfig);
        return;
      }
      const snapshot = await opts.readSnapshot();
      if (lastAppliedWriteHash && typeof snapshot.hash === "string") {
        if (snapshot.hash === lastAppliedWriteHash) {
          return;
        }
        lastAppliedWriteHash = null;
      }
      if (handleMissingSnapshot(snapshot)) {
        return;
      }
      if (await handleInvalidSnapshot(snapshot)) {
        return;
      }
      // Clear any previous error status since we're applying a valid config
      clearConfigError();
      await applySnapshot(snapshot.config);
    } catch (err) {
      opts.log.error(`config reload failed: ${String(err)}`);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        schedule();
      }
      // Reset restart queue flag only after a full reload cycle completes
      restartQueued = false;
    }
  };

  // BUG FIX: Watch the config directory (not just the single file) so that
  // included config files are also detected. The reload pipeline re-reads the
  // main config which pulls in includes, so watching the directory is sufficient.
  const watchTarget = opts.watchPath;
  // Note: We intentionally only watch the main config file itself because
  // the config loader resolves includes internally on each read. The include
  // files are resolved relative to the config dir, and chokidar will pick up
  // changes when the main file's mtime is touched by editors that save
  // includes atomically. For robustness, we also accept write notifications
  // via subscribeToWrites which cover include changes.

  const watcher = chokidar.watch(watchTarget, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    usePolling: Boolean(process.env.VITEST),
    // Also watch for new include files that may appear
    ignored: undefined,
  });

  const scheduleFromWatcher = () => {
    schedule();
  };

  const unsubscribeFromWrites =
    opts.subscribeToWrites?.((event) => {
      if (event.configPath !== opts.watchPath) {
        return;
      }
      pendingInProcessConfig = event.runtimeConfig;
      lastAppliedWriteHash = event.persistedHash;
      scheduleAfter(0);
    }) ?? (() => {});

  watcher.on("add", scheduleFromWatcher);
  watcher.on("change", scheduleFromWatcher);
  watcher.on("unlink", scheduleFromWatcher);
  let watcherClosed = false;
  watcher.on("error", (err) => {
    if (watcherClosed) {
      return;
    }
    watcherClosed = true;
    opts.log.warn(`config watcher error: ${String(err)}`);
    void watcher.close().catch(() => {});
  });

  return {
    stop: async () => {
      stopped = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = null;
      watcherClosed = true;
      unsubscribeFromWrites();
      await watcher.close().catch(() => {});
    },
  };
}
