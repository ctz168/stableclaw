/**
 * Lightweight Gateway Kernel (server-lite.ts)
 *
 * Fast-starting gateway entry point that boots HTTP/WS + basic auth in under
 * 2 seconds. All heavy subsystem initialisation (plugins, channels,
 * discovery, cron, etc.) is deferred to background lazy loading via the
 * {@link lazyRegistry}.
 *
 * Usage:
 *   const server = await startGatewayLite(18789);
 *   // server is listening on port 18789 within ~1s
 *   // modules initialise in the background
 */

import crypto from "node:crypto";
import http from "node:http";
import { WebSocketServer } from "ws";
import {
  type OpenClawConfig,
  applyConfigOverrides,
  readConfigFileSnapshot,
  replaceConfigFile,
} from "../config/config.js";
import { resolveGatewayPort } from "../config/paths.js";
import { resolveGatewayAuth, type ResolvedGatewayAuth } from "./auth.js";
import { lazyRegistry } from "./lazy-registry.js";
import { registerGatewayLazyModules } from "./lazy-modules.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { attachLiteWsHandler, type LiteWsClient } from "./server-lite-ws.js";

const log = createSubsystemLogger("gateway/lite");

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GatewayServer = {
  close: (opts?: { reason?: string; restartExpectedMs?: number | null }) => Promise<void>;
};

export type GatewayLiteOptions = {
  /**
   * Override the listening port.
   */
  port?: number;
  /**
   * Bind address policy.
   * - "loopback" → 127.0.0.1 (default)
   * - "lan" → 0.0.0.0
   * - "tailnet" → 0.0.0.0 (refined later by tailscale module)
   * - "auto" → prefer loopback, else LAN
   */
  bind?: "loopback" | "lan" | "auto" | "tailnet" | "custom";
  /**
   * Advanced: explicit bind host, bypassing bind resolution.
   */
  host?: string;
  /**
   * Merge additional auth config (token / password / mode).
   */
  auth?: { mode?: string; token?: string; password?: string; allowTailscale?: boolean };
  /**
   * Tailscale exposure override.
   */
  tailscale?: { mode?: string; resetOnExit?: boolean };
};

// ---------------------------------------------------------------------------
// Bind address resolution
// ---------------------------------------------------------------------------

function resolveBindAddress(bind?: string, host?: string): string {
  if (host) {
    return host;
  }
  switch (bind) {
    case "lan":
    case "tailnet":
      return "0.0.0.0";
    case "auto":
      return "127.0.0.1";
    case "loopback":
    default:
      return "127.0.0.1";
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

let serverStartTime: number = 0;
let activeHttpServer: http.Server | null = null;
let activeWss: WebSocketServer | null = null;
let activeClients = new Set<LiteWsClient>();
let activeConfig: OpenClawConfig | null = null;
let activeAuth: ResolvedGatewayAuth | null = null;
let allLazyModulesReady = false;

export async function startGatewayLite(
  port = 18789,
  opts: GatewayLiteOptions = {},
): Promise<GatewayServer> {
  serverStartTime = Date.now();
  activeClients = new Set<LiteWsClient>();

  // ── 1. Load config (file I/O only, no plugin loading) ───────────────────
  log.info("loading configuration...");
  let cfg: OpenClawConfig;
  try {
    const configSnapshot = await readConfigFileSnapshot();
    cfg = applyConfigOverrides(configSnapshot.config);
  } catch (err) {
    log.warn(`config load failed (starting with defaults): ${String(err)}`);
    cfg = {} as OpenClawConfig;
  }
  activeConfig = cfg;

  // ── 2. Resolve auth (config parsing only, no secrets system) ────────────
  log.info("resolving authentication...");
  const resolvedAuth = resolveGatewayAuth({
    authConfig: cfg.gateway?.auth,
    authOverride: opts.auth as import("../config/types.gateway.js").GatewayAuthConfig | undefined,
    env: process.env,
  });
  activeAuth = resolvedAuth;

  if (resolvedAuth.mode === "token" && !resolvedAuth.token && !resolvedAuth.allowTailscale) {
    // Generate a persistent token so the gateway is usable immediately and across restarts.
    const generatedToken = crypto.randomBytes(24).toString("hex");
    log.warn(
      "No gateway auth token configured. Auto-generated a token for persistent auth. " +
        "Set gateway.auth.token or OPENCLAW_GATEWAY_TOKEN to override.",
    );
    log.info(`Generated gateway token: ${generatedToken}`);
    log.info("Save this token — it will not be shown again.");
    activeAuth = { ...resolvedAuth, token: generatedToken };

    // Persist the generated token to config so it survives restarts.
    try {
      const nextCfg: OpenClawConfig = {
        ...cfg,
        gateway: {
          ...cfg.gateway,
          auth: {
            ...cfg.gateway?.auth,
            mode: "token",
            token: generatedToken,
          },
        },
      };
      await replaceConfigFile({ nextConfig: nextCfg });
      log.info("Generated token persisted to config file.");
    } catch (persistErr) {
      log.warn(
        `Failed to persist generated token to config: ${String(persistErr)}. ` +
          "The token is ephemeral for this session only.",
      );
    }
  }

  // ── 3. Resolve bind address & port ─────────────────────────────────────
  const actualPort = opts.port ?? resolveGatewayPort(cfg);
  const bindHost = resolveBindAddress(opts.bind, opts.host);
  process.env.OPENCLAW_GATEWAY_PORT = String(actualPort);

  // ── 4. Create HTTP server (FAST) ───────────────────────────────────────
  log.info("starting HTTP server...");
  const httpServer = http.createServer((req, res) => {
    handleHttpRequest(req, res);
  });

  // ── 5. Create WS server on same port (FAST) ────────────────────────────
  const wss = new WebSocketServer({ server: httpServer });
  activeHttpServer = httpServer;
  activeWss = wss;

  // Attach the lite WS handler (protocol-compatible connect handshake +
  // lazy module routing)
  const wsHandler = attachLiteWsHandler(wss, {
    resolvedAuth: activeAuth,
    moduleLoadTimeoutMs: 15_000,
  });
  activeClients = wsHandler.clients;

  // ── 6. Start listening ─────────────────────────────────────────────────
  await new Promise<void>((resolve, reject) => {
    httpServer.on("error", reject);
    httpServer.listen(actualPort, bindHost, () => {
      resolve();
    });
  });

  const bootTimeMs = Date.now() - serverStartTime;
  log.info(`gateway kernel ready in ${bootTimeMs}ms on ${bindHost}:${actualPort}`);

  // ── 7. Background lazy initialisation (non-blocking) ───────────────────
  registerGatewayLazyModules();
  scheduleBackgroundInit();

  // ── 8. Return server handle ────────────────────────────────────────────
  return {
    close: async (closeOpts) => {
      const reason = closeOpts?.reason ?? "shutdown";
      log.info(`shutting down gateway: ${reason}`);
      // Close all WS clients
      for (const client of wsHandler.getConnectedClients()) {
        try {
          client.socket.close(1001, reason);
        } catch {
          // already closed
        }
      }
      wsHandler.clients.clear();
      wss.close();
      return new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Background lazy initialisation schedule
// ---------------------------------------------------------------------------

function scheduleBackgroundInit(): void {
  // Tier 1 (100ms): most critical – plugins + channels
  setTimeout(() => {
    log.info("initialising core modules (plugins, channels)...");
    lazyRegistry.prefetchMany(["plugins", "channels"]).then(() => {
      log.info("core modules initialised");
    });
  }, 100);

  // Tier 2 (2s): secondary – cron, discovery, maintenance, config-reload
  setTimeout(() => {
    log.info("initialising secondary modules...");
    lazyRegistry
      .prefetchMany(["cron", "discovery", "maintenance", "config-reload"])
      .then(() => {
        log.info("secondary modules initialised");
      });
  }, 2000);

  // Tier 3 (4s): tertiary – health, pricing, memory, hooks
  setTimeout(() => {
    lazyRegistry
      .prefetchMany([
        "channel-health",
        "model-pricing",
        "memory",
        "hooks",
        "plugin-services",
        "gmail-watcher",
        "node-subscriptions",
      ])
      .then(() => {
        log.info("tertiary modules initialised");
      });
  }, 4000);

  // Tier 4 (6s): deferred – tailscale, canvas-host, task-registry
  setTimeout(() => {
    lazyRegistry
      .prefetchMany(["tailscale", "canvas-host", "task-registry"])
      .then(() => {
        log.info("deferred modules initialised");
        allLazyModulesReady = true;
      });
  }, 6000);
}

// ---------------------------------------------------------------------------
// HTTP request handler
// ---------------------------------------------------------------------------

function handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  // CORS headers (for Control UI)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health endpoint
  if (url === "/health" || url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    const pluginsReady = lazyRegistry.isReady("plugins");
    const channelsReady = lazyRegistry.isReady("channels");
    const status = pluginsReady && channelsReady ? "ready" : "starting";
    const body = {
      status,
      uptime: Date.now() - serverStartTime,
      modules: lazyRegistry.getStatus(),
      fullyLoaded: allLazyModulesReady,
    };
    res.end(JSON.stringify(body));
    return;
  }

  // Control UI bootstrap config (lightweight, no SPA file serving yet)
  const bootstrapPath = "/__openclaw/control-ui-config.json";
  if (url === bootstrapPath && method === "GET") {
    const body = JSON.stringify({
      gatewayPort: process.env.OPENCLAW_GATEWAY_PORT,
      version: "lite",
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
    return;
  }

  // 404 for everything else (static file serving is loaded lazily)
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

// ---------------------------------------------------------------------------
// Exports for testing / introspection
// ---------------------------------------------------------------------------

/** Get the lazy registry singleton for test inspection. */
export function getLazyRegistry() {
  return lazyRegistry;
}

/** Check whether all lazy modules have finished loading. */
export function isFullyLoaded(): boolean {
  return allLazyModulesReady;
}

/** Get server start time. */
export function getServerStartTime(): number {
  return serverStartTime;
}

/** Get active config. */
export function getActiveConfig(): OpenClawConfig | null {
  return activeConfig;
}

/** Get resolved auth. */
export function getActiveAuth(): ResolvedGatewayAuth | null {
  return activeAuth;
}

/** Get active WS clients. */
export function getActiveClients(): Set<LiteWsClient> {
  return activeClients;
}
