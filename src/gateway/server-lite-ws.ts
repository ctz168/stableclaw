/**
 * Lightweight WS Protocol Handler (server-lite-ws.ts)
 *
 * Provides a protocol-compatible WebSocket connection handler for the lite
 * gateway kernel. Handles the `connect` handshake immediately and defers
 * all other method handling to lazy-loaded modules via the lazy registry.
 *
 * Protocol compatibility:
 * - Emits `connect.challenge` event with nonce on connection
 * - Requires first message to be `{ type:"req", method:"connect", ... }`
 * - Responds with `hello-ok` payload on successful connect
 * - Post-connect requests are routed to lazy modules with timeout
 * - Uses the same JSON-RPC-like frame format as the full gateway
 */

import crypto from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { WebSocket, WebSocketServer } from "ws";
import { lazyRegistry } from "./lazy-registry.js";
import { type ResolvedGatewayAuth, authorizeGatewayConnect } from "./auth.js";
import { safeEqualSecret } from "../security/secret-equal.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { GatewayRequestContext } from "./server-methods/types.js";
import {
  type ConnectParams,
  ErrorCodes,
  type ErrorShape,
  errorShape,
  PROTOCOL_VERSION,
  validateConnectParams,
  validateRequestFrame,
  formatValidationErrors,
} from "./protocol/index.js";
import { isLoopbackAddress } from "./net.js";
import { MAX_PREAUTH_PAYLOAD_BYTES, MAX_PAYLOAD_BYTES } from "./server-constants.js";
import { createDefaultDeps } from "../cli/deps.js";
import { NodeRegistry } from "./node-registry.js";

const log = createSubsystemLogger("gateway/lite-ws");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LiteWsClient = {
  socket: WebSocket;
  connect: ConnectParams;
  connId: string;
  remoteAddr?: string;
  clientIp?: string;
  authMethod?: string;
  connectedAtMs: number;
};

export type LiteWsHandlerOptions = {
  /** Resolved auth config for the gateway. */
  resolvedAuth: ResolvedGatewayAuth;
  /** Maximum time (ms) to wait for a lazy module before rejecting. */
  moduleLoadTimeoutMs?: number;
};

/** Maps gateway method prefixes to the lazy module that must be loaded. */
const METHOD_MODULE_MAP: Record<string, string> = {
  "sessions.": "plugins",
  "chat.": "plugins",
  "agents.": "plugins",
  "agent.": "plugins",
  "send": "plugins",
  "poll": "plugins",
  "cron.": "cron",
  "nodes.": "plugins",
  "node.": "plugins",
  "channels.": "channels",
  "channel.": "channels",
  "models.": "model-pricing",
  "secrets.": "plugins",
  "config.": "plugins",
  "plugins.": "plugins",
  "plugin.": "plugin-services",
  "device.": "plugins",
  "exec-approvals.": "plugins",
  "logs.": "plugins",
  "presence.": "plugins",
  "canvas.": "canvas-host",
  "tasks.": "task-registry",
  "health.": "channel-health",
  "memory.": "memory",
  "hooks.": "hooks",
  "gmail.": "gmail-watcher",
};

/** Methods that can be handled without any lazy module. */
const LITE_NATIVE_METHODS = new Set([
  "ping",
  "version",
  "health.get",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRequiredModule(method: string): string | undefined {
  for (const [prefix, moduleName] of Object.entries(METHOD_MODULE_MAP)) {
    if (method === prefix || method.startsWith(prefix)) {
      return moduleName;
    }
  }
  return undefined;
}

function getRawDataByteLength(data: unknown): number {
  if (Buffer.isBuffer(data)) {
    return data.byteLength;
  }
  if (Array.isArray(data)) {
    return data.reduce((total, chunk) => total + chunk.byteLength, 0);
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }
  return Buffer.byteLength(String(data));
}

function rawDataToString(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf-8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf-8");
  }
  return String(data);
}

function setSocketMaxPayload(socket: WebSocket, maxPayload: number): void {
  const receiver = (socket as { _receiver?: { _maxPayload?: number } })._receiver;
  if (receiver) {
    receiver._maxPayload = maxPayload;
  }
}

// ---------------------------------------------------------------------------
// Connect auth for lite mode
// ---------------------------------------------------------------------------

async function performConnectAuth(
  connectAuth: ConnectParams["auth"],
  resolvedAuth: ResolvedGatewayAuth,
  req?: IncomingMessage,
): Promise<{ ok: boolean; method?: string; reason?: string }> {
  // Use the real authorizeGatewayConnect from auth.ts for mode "none"
  if (resolvedAuth.mode === "none") {
    return { ok: true, method: "none" };
  }

  // For token mode – use safeEqualSecret to avoid timing attacks
  if (resolvedAuth.mode === "token") {
    const connectToken = connectAuth?.token;
    if (!resolvedAuth.token) {
      return { ok: false, reason: "token_missing_config" };
    }
    if (!connectToken) {
      return { ok: false, reason: "token_missing" };
    }
    if (!safeEqualSecret(connectToken, resolvedAuth.token)) {
      return { ok: false, reason: "token_mismatch" };
    }
    return { ok: true, method: "token" };
  }

  // For password mode
  if (resolvedAuth.mode === "password") {
    const connectPassword = connectAuth?.password;
    if (!resolvedAuth.password) {
      return { ok: false, reason: "password_missing_config" };
    }
    if (!connectPassword) {
      return { ok: false, reason: "password_missing" };
    }
    if (!safeEqualSecret(connectPassword, resolvedAuth.password)) {
      return { ok: false, reason: "password_mismatch" };
    }
    return { ok: true, method: "password" };
  }

  // For trusted-proxy – delegate to the real auth system
  if (resolvedAuth.mode === "trusted-proxy") {
    try {
      const result = await authorizeGatewayConnect({
        auth: resolvedAuth,
        connectAuth: connectAuth ? { token: connectAuth.token, password: connectAuth.password } : null,
        req,
      });
      if (result.ok) {
        return { ok: true, method: result.method };
      }
      return { ok: false, reason: result.reason ?? "unauthorized" };
    } catch (err) {
      return { ok: false, reason: String(err) };
    }
  }

  return { ok: false, reason: "unsupported_auth_mode" };
}

// ---------------------------------------------------------------------------
// Format auth failure messages (matching the full gateway's messages)
// ---------------------------------------------------------------------------

function formatAuthFailureMessage(authMode: string, reason?: string): string {
  switch (reason) {
    case "token_missing":
      return "unauthorized: gateway token missing (set gateway.remote.token to match gateway.auth.token)";
    case "token_mismatch":
      return "unauthorized: gateway token mismatch (set gateway.remote.token to match gateway.auth.token)";
    case "token_missing_config":
      return "unauthorized: gateway token not configured on gateway (set gateway.auth.token)";
    case "password_missing":
      return "unauthorized: gateway password missing (set gateway.remote.password to match gateway.auth.password)";
    case "password_mismatch":
      return "unauthorized: gateway password mismatch (set gateway.remote.password to match gateway.auth.password)";
    case "password_missing_config":
      return "unauthorized: gateway password not configured on gateway (set gateway.auth.password)";
    case "rate_limited":
      return "unauthorized: too many failed authentication attempts (retry later)";
    default:
      break;
  }

  if (authMode === "token") {
    return "unauthorized: gateway token missing (set gateway.remote.token to match gateway.auth.token)";
  }
  if (authMode === "password") {
    return "unauthorized: gateway password missing (set gateway.remote.password to match gateway.auth.password)";
  }
  return "unauthorized";
}

// ---------------------------------------------------------------------------
// Main: attach lite WS handler to a WebSocketServer
// ---------------------------------------------------------------------------

export function attachLiteWsHandler(
  wss: WebSocketServer,
  opts: LiteWsHandlerOptions,
): {
  clients: Set<LiteWsClient>;
  getConnectedClients: () => LiteWsClient[];
} {
  const { resolvedAuth } = opts;
  const moduleLoadTimeoutMs = opts.moduleLoadTimeoutMs ?? 15_000;
  const clients = new Set<LiteWsClient>();

  wss.on("connection", (socket, upgradeReq) => {
    let client: LiteWsClient | null = null;
    let closed = false;
    let handshakeComplete = false;
    const openedAt = Date.now();
    const connId = crypto.randomUUID();
    const remoteAddr = (socket as WebSocket & { _socket?: { remoteAddress?: string } })._socket
      ?.remoteAddress;
    const connectNonce = crypto.randomUUID();

    // ── Lifecycle helpers ─────────────────────────────────────────────────

    const send = (obj: unknown): void => {
      if (socket.readyState === socket.OPEN) {
        try {
          socket.send(JSON.stringify(obj));
        } catch {
          /* ignore */
        }
      }
    };

    const close = (code = 1008, reason?: string): void => {
      if (closed) {
        return;
      }
      closed = true;
      if (client) {
        clients.delete(client);
      }
      try {
        socket.close(code, reason);
      } catch {
        /* ignore */
      }
    };

    // ── Send connect challenge (protocol compat) ──────────────────────────
    send({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: connectNonce, ts: Date.now() },
    });

    // ── Handshake timeout ─────────────────────────────────────────────────
    const handshakeTimeoutMs = 30_000;
    const handshakeTimer = setTimeout(() => {
      if (!handshakeComplete && !closed) {
        log.debug(`handshake timeout conn=${connId} remote=${remoteAddr ?? "?"}`);
        close(1008, "handshake timeout");
      }
    }, handshakeTimeoutMs);

    const clearHandshakeTimer = () => clearTimeout(handshakeTimer);

    // ── Socket events ─────────────────────────────────────────────────────

    socket.on("error", (err) => {
      log.debug(`socket error conn=${connId}: ${String(err)}`);
      close();
    });

    socket.on("close", (code, reason) => {
      if (client) {
        clients.delete(client);
      }
      log.debug(
        `client disconnected conn=${connId} code=${code} reason=${reason?.toString() ?? "n/a"}`,
      );
      clearHandshakeTimer();
    });

    // ── Message handler ───────────────────────────────────────────────────

    socket.on("message", async (data) => {
      if (closed) {
        return;
      }

      // Preauth payload size check
      if (!handshakeComplete) {
        const byteLen = getRawDataByteLength(data);
        if (byteLen > MAX_PREAUTH_PAYLOAD_BYTES) {
          log.debug(`preauth payload too large conn=${connId} bytes=${byteLen}`);
          close(1009, "preauth payload too large");
          return;
        }
      }

      const text = rawDataToString(data);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        log.debug(`invalid json conn=${connId}`);
        close(1008, "invalid json");
        return;
      }

      if (!parsed || typeof parsed !== "object") {
        close(1008, "invalid frame");
        return;
      }

      const frame = parsed as Record<string, unknown>;

      // ── HANDSHAKE: first message must be connect ────────────────────────
      if (!handshakeComplete) {
        const isRequestFrame = validateRequestFrame(frame);
        if (
          !isRequestFrame ||
          frame.method !== "connect" ||
          !validateConnectParams(frame.params)
        ) {
          const handshakeError = isRequestFrame
            ? frame.method === "connect"
              ? `invalid connect params: ${formatValidationErrors(validateConnectParams.errors)}`
              : "invalid handshake: first request must be connect"
            : "invalid request frame";

          log.debug(
            `invalid handshake conn=${connId} remote=${remoteAddr ?? "?"}: ${handshakeError}`,
          );

          if (isRequestFrame) {
            send({
              type: "res",
              id: frame.id,
              ok: false,
              error: errorShape(ErrorCodes.INVALID_REQUEST, handshakeError),
            });
            close(1008, handshakeError.length > 123 ? handshakeError.slice(0, 123) : handshakeError);
          } else {
            close(1008, "invalid handshake");
          }
          return;
        }

        const connectParams = frame.params as ConnectParams;
        void handleConnect(
          frame.id as string,
          connectParams,
          socket,
          upgradeReq,
          connId,
          remoteAddr,
          connectNonce,
          resolvedAuth,
          openedAt,
        )
          .then((result) => {
            if (!result.ok) {
              close(
                1008,
                result.reason?.length ? result.reason.slice(0, 123) : "unauthorized",
              );
              return;
            }

            handshakeComplete = true;
            clearHandshakeTimer();
            setSocketMaxPayload(socket, MAX_PAYLOAD_BYTES);

            client = {
              socket,
              connect: connectParams,
              connId,
              remoteAddr,
              clientIp: remoteAddr && !isLoopbackAddress(remoteAddr) ? remoteAddr : undefined,
              authMethod: result.authMethod,
              connectedAtMs: Date.now(),
            };
            clients.add(client);

            // hello-ok response (protocol version 3)
            const helloOk = {
              type: "hello-ok",
              protocol: PROTOCOL_VERSION,
              server: {
                version: "lite",
                connId,
              },
              features: {
                methods: [
                  "ping",
                  "version",
                  "health.get",
                  "status",
                ],
                events: ["connect.challenge"],
              },
              snapshot: {
                presence: [],
                health: { status: lazyRegistry.isReady("plugins") ? "ready" : "starting" },
                sessions: [],
                channels: {},
                stateVersion: { presence: 0, health: 0 },
              },
              policy: {
                maxPayload: MAX_PAYLOAD_BYTES,
              },
            };

            log.info(
              `client authenticated conn=${connId} remote=${remoteAddr ?? "?"} ` +
                `client=${connectParams.client?.id ?? "?"} ` +
                `auth=${result.authMethod} ` +
                `(total: ${clients.size})`,
            );

            send({ type: "res", id: frame.id, ok: true, payload: helloOk });
          })
          .catch((err) => {
            log.debug(`connect handler error conn=${connId}: ${String(err)}`);
            send({
              type: "res",
              id: frame.id,
              ok: false,
              error: errorShape(ErrorCodes.INVALID_REQUEST, String(err)),
            });
            close(1008, "internal error");
          });
        return;
      }

      // ── POST-HANDSHAKE: validate request frame ─────────────────────────
      if (!validateRequestFrame(frame)) {
        send({
          type: "res",
          id: (frame.id ?? "invalid") as string,
          ok: false,
          error: errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid request frame: ${formatValidationErrors(validateRequestFrame.errors)}`,
          ),
        });
        return;
      }

      const method = frame.method as string;
      const id = frame.id as string;
      const params = frame.params;

      // ── Route to handler ────────────────────────────────────────────────
      if (LITE_NATIVE_METHODS.has(method)) {
        handleLiteNativeMethod(method, id, params, send);
        return;
      }

      // Check required module
      const requiredModule = resolveRequiredModule(method);
      if (requiredModule) {
        await handleLazyModuleMethod(
          method,
          id,
          params,
          send,
          requiredModule,
          moduleLoadTimeoutMs,
          connId,
          clients,
          client!.connect,
        );
        return;
      }

      // Unknown method
      send({
        type: "res",
        id,
        ok: false,
        error: errorShape(ErrorCodes.INVALID_REQUEST, `unknown method: ${method}`),
      });
    });
  });

  return {
    clients,
    getConnectedClients: () => [...clients],
  };
}

// ---------------------------------------------------------------------------
// Connect handler (authentication handshake)
// ---------------------------------------------------------------------------

async function handleConnect(
  frameId: string,
  connectParams: ConnectParams,
  socket: WebSocket,
  upgradeReq: IncomingMessage,
  connId: string,
  remoteAddr: string | undefined,
  connectNonce: string,
  resolvedAuth: ResolvedGatewayAuth,
  openedAt: number,
): Promise<{ ok: boolean; authMethod?: string; reason?: string }> {
  // ── Protocol version negotiation ───────────────────────────────────────
  const { minProtocol, maxProtocol } = connectParams;
  if (
    typeof minProtocol === "number" && typeof maxProtocol === "number" &&
    (maxProtocol < PROTOCOL_VERSION || minProtocol > PROTOCOL_VERSION)
  ) {
    const send = (obj: unknown) => {
      if (socket.readyState === socket.OPEN) {
        try {
          socket.send(JSON.stringify(obj));
        } catch {
          /* ignore */
        }
      }
    };
    send({
      type: "res",
      id: frameId,
      ok: false,
      error: errorShape(ErrorCodes.INVALID_REQUEST, "protocol mismatch", {
        details: { expectedProtocol: PROTOCOL_VERSION },
      }),
    });
    return { ok: false, reason: "protocol mismatch" };
  }

  // ── Auth check ─────────────────────────────────────────────────────────
  const authResult = await performConnectAuth(connectParams.auth, resolvedAuth, upgradeReq);

  if (!authResult.ok) {
    const send = (obj: unknown) => {
      if (socket.readyState === socket.OPEN) {
        try {
          socket.send(JSON.stringify(obj));
        } catch {
          /* ignore */
        }
      }
    };
    const authMessage = formatAuthFailureMessage(resolvedAuth.mode, authResult.reason);
    send({
      type: "res",
      id: frameId,
      ok: false,
      error: errorShape(ErrorCodes.INVALID_REQUEST, authMessage, {
        details: { authReason: authResult.reason },
      }),
    });
    log.debug(
      `unauthorized conn=${connId} remote=${remoteAddr ?? "?"} ` +
        `client=${connectParams.client?.id ?? "?"} reason=${authResult.reason}`,
    );
    return { ok: false, reason: authResult.reason };
  }

  return { ok: true, authMethod: authResult.method };
}

// ---------------------------------------------------------------------------
// Lite-native method handlers
// ---------------------------------------------------------------------------

function handleLiteNativeMethod(
  method: string,
  id: string,
  _params: unknown,
  send: (obj: unknown) => void,
): void {
  switch (method) {
    case "ping":
      send({ type: "res", id, ok: true, payload: { pong: true, ts: Date.now() } });
      break;

    case "version":
      send({
        type: "res",
        id,
        ok: true,
        payload: {
          version: "lite",
          protocol: PROTOCOL_VERSION,
          modules: lazyRegistry.getStatus(),
        },
      });
      break;

    case "health.get":
      send({
        type: "res",
        id,
        ok: true,
        payload: {
          status: lazyRegistry.isReady("plugins") ? "ready" : "starting",
          modules: lazyRegistry.getStatus(),
        },
      });
      break;

    default:
      send({
        type: "res",
        id,
        ok: false,
        error: errorShape(ErrorCodes.INVALID_REQUEST, `unknown method: ${method}`),
      });
  }
}

// ---------------------------------------------------------------------------
// Full gateway method dispatcher (lazy loaded)
// ---------------------------------------------------------------------------

// NOTE: Production builds (tsdown with NODE_ENV=production) minify export
// names, so `module.handleGatewayRequest` becomes `module.n`. We work around
// this by loading the module and scanning for the function by its original
// name via Function.prototype.name (which rollup/tsdown preserve as comments
// or in .name property).

let handleGatewayRequestFn: ((opts: import("./server-methods.js")["handleGatewayRequest"]) => Promise<void>) | null = null;
let fullHandlerLoading = false;
let fullHandlerLoadFailed = false;

async function getFullHandler() {
  if (handleGatewayRequestFn) return handleGatewayRequestFn;
  if (fullHandlerLoadFailed) return null;
  if (fullHandlerLoading) {
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (handleGatewayRequestFn) return handleGatewayRequestFn;
      if (fullHandlerLoadFailed) return null;
    }
    return null;
  }
  fullHandlerLoading = true;
  try {
    const mod = await import("./server-methods.js");
    // Production builds minify the export key names but the .name property
    // of exported functions is preserved. Find handleGatewayRequest by name.
    let found = false;
    for (const val of Object.values(mod)) {
      if (typeof val === "function" && val.name === "handleGatewayRequest") {
        handleGatewayRequestFn = val;
        found = true;
        break;
      }
    }
    if (!found) {
      // Fallback: try the original export name (works in non-minified builds)
      if (typeof (mod as Record<string, unknown>).handleGatewayRequest === "function") {
        handleGatewayRequestFn = (mod as Record<string, unknown>).handleGatewayRequest as typeof handleGatewayRequestFn;
      } else {
        throw new Error("handleGatewayRequest not found in server-methods module");
      }
    }
    log.info("full gateway method dispatcher loaded");
    return handleGatewayRequestFn;
  } catch (err) {
    log.warn(`failed to load full gateway method dispatcher: ${String(err)}`);
    fullHandlerLoadFailed = true;
    return null;
  }
}

/** Build a minimal GatewayRequestContext for lite mode dispatch. */
function buildLiteRequestContext(clients: Set<LiteWsClient>): GatewayRequestContext {
  const chatAbortControllers = new Map<string, import("../chat-abort.js").ChatAbortControllerEntry>();
  const chatAbortedRuns = new Map<string, number>();
  const chatRunBuffers = new Map<string, string>();
  const chatDeltaSentAt = new Map<string, number>();
  const chatDeltaLastBroadcastLen = new Map<string, number>();
  const agentRunSeq = new Map<string, number>();
  const dedupe = new Map<string, import("./server-shared.js").DedupeEntry>();
  const toolEventRecipients = new Map<string, Set<string>>();
  const wizardSessions = new Map<string, import("../../wizard/session.js").WizardSession>();
  const sessionSubscribers = new Map<string, Set<string>>();
  const sessionMessageSubscribers = new Map<string, Map<string, Set<string>>>();

  // Convert LiteWsClient set to a compatible broadcast target.
  // The broadcast function iterates clients and calls socket.send() —
  // LiteWsClient has the same socket/connect/connId shape.
  const compatClients = clients as unknown as Set<import("./server/ws-types.js").GatewayWsClient>;

  return {
    // Real deps — lazy-loading send functions (cheap, no heavy deps)
    deps: createDefaultDeps(),
    cron: undefined as unknown as GatewayRequestContext["cron"],
    cronStorePath: "",
    execApprovalManager: undefined,
    pluginApprovalManager: undefined,
    loadGatewayModelCatalog: async () => {
      // Lazy-load model catalog from the plugins module
      try {
        const mods = await lazyRegistry.get("model-pricing");
        return mods?.getModelCatalog?.() ?? [];
      } catch {
        return [];
      }
    },
    getHealthCache: () => null,
    refreshHealthSnapshot: async () => ({
      status: lazyRegistry.isReady("plugins") ? "ready" : "starting",
      uptime: 0,
    }),
    logHealth: { error: () => {} },
    logGateway: log,
    incrementPresenceVersion: () => 0,
    getHealthVersion: () => 0,
    broadcast: (event: string, payload: unknown) => {
      for (const client of compatClients) {
        try {
          if (client.socket.readyState === client.socket.OPEN) {
            client.socket.send(JSON.stringify({ type: "event", event, payload }));
          }
        } catch { /* ignore */ }
      }
    },
    broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
      for (const client of compatClients) {
        if (connIds.has(client.connId)) {
          try {
            if (client.socket.readyState === client.socket.OPEN) {
              client.socket.send(JSON.stringify({ type: "event", event, payload }));
            }
          } catch { /* ignore */ }
        }
      }
    },
    nodeSendToSession: () => {},
    nodeSendToAllSubscribed: () => {},
    nodeSubscribe: () => {},
    nodeUnsubscribe: () => {},
    nodeUnsubscribeAll: () => {},
    hasConnectedMobileNode: () => false,
    nodeRegistry: new NodeRegistry(),
    agentRunSeq,
    chatAbortControllers,
    chatAbortedRuns,
    chatRunBuffers,
    chatDeltaSentAt,
    chatDeltaLastBroadcastLen,
    addChatRun: (_sessionId: string, _entry: { sessionKey: string; clientRunId: string }) => {},
    removeChatRun: (_sessionId: string, _clientRunId: string) => undefined,
    subscribeSessionEvents: (connId: string) => {
      sessionSubscribers.set(connId, new Set());
    },
    unsubscribeSessionEvents: (connId: string) => {
      sessionSubscribers.delete(connId);
    },
    subscribeSessionMessageEvents: (connId: string, sessionKey: string) => {
      let subs = sessionMessageSubscribers.get(connId);
      if (!subs) {
        subs = new Map();
        sessionMessageSubscribers.set(connId, subs);
      }
      if (!subs.has(sessionKey)) {
        subs.set(sessionKey, new Set());
      }
    },
    unsubscribeSessionMessageEvents: (connId: string, sessionKey: string) => {
      const subs = sessionMessageSubscribers.get(connId);
      if (subs) {
        subs.delete(sessionKey);
        if (subs.size === 0) sessionMessageSubscribers.delete(connId);
      }
    },
    unsubscribeAllSessionEvents: (connId: string) => {
      sessionSubscribers.delete(connId);
      sessionMessageSubscribers.delete(connId);
    },
    getSessionEventSubscriberConnIds: () => new Set(sessionSubscribers.keys()),
    registerToolEventRecipient: (runId: string, connId: string) => {
      let set = toolEventRecipients.get(runId);
      if (!set) {
        set = new Set();
        toolEventRecipients.set(runId, set);
      }
      set.add(connId);
    },
    dedupe,
    wizardSessions,
    findRunningWizard: () => null,
    purgeWizardSession: (_id: string) => {},
    getRuntimeSnapshot: () => ({ channels: {}, channelError: null }),
    startChannel: async () => {},
    stopChannel: async () => {},
    markChannelLoggedOut: () => {},
    wizardRunner: async () => {},
    broadcastVoiceWakeChanged: () => {},
  };
}

/** Cached context — rebuilt on first dispatch after modules are ready. */
let cachedLiteContext: { context: GatewayRequestContext; clients: Set<LiteWsClient> } | null = null;

function getOrCreateLiteContext(clients: Set<LiteWsClient>): GatewayRequestContext {
  if (cachedLiteContext && cachedLiteContext.clients === clients) {
    return cachedLiteContext.context;
  }
  cachedLiteContext = { context: buildLiteRequestContext(clients), clients };
  return cachedLiteContext.context;
}

// ---------------------------------------------------------------------------
// Lazy module method handler (with timeout)
// ---------------------------------------------------------------------------

async function handleLazyModuleMethod(
  method: string,
  id: string,
  params: unknown,
  send: (obj: unknown) => void,
  requiredModule: string,
  timeoutMs: number,
  connId: string,
  clients: Set<LiteWsClient>,
  connectParams: ConnectParams,
): Promise<void> {
  // Build respond function matching the full gateway's signature
  const respond = (ok: boolean, payload?: unknown, error?: unknown) => {
    send({ type: "res", id, ok, payload, error });
  };

  try {
    // Wait for the required module with timeout
    await Promise.race([
      lazyRegistry.get(requiredModule),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`module "${requiredModule}" not ready within ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);

    // For methods that require the full gateway dispatcher (chat.*, sessions.*, etc.),
    // try to load the full handler and dispatch.
    const handleReq = await getFullHandler();
    if (!handleReq) {
      send({
        type: "res",
        id,
        ok: false,
        error: errorShape(
          ErrorCodes.UNAVAILABLE,
          `method "${method}" requires the full gateway runtime (module "${requiredModule}" loaded but method dispatcher could not be loaded).`,
        ),
      });
      return;
    }

    const context = getOrCreateLiteContext(clients);
    const client: import("./server-methods/types.js").GatewayClient = {
      connect: connectParams,
      connId,
      clientIp: undefined,
    };

    await handleReq({
      req: { id, method, params: params as Record<string, unknown> },
      client,
      isWebchatConnect: (p) => p?.client?.mode === "webchat",
      respond,
      context,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.debug(`lazy module "${requiredModule}" not ready for "${method}" conn=${connId}: ${msg}`);
    send({
      type: "res",
      id,
      ok: false,
      error: errorShape(
        ErrorCodes.UNAVAILABLE,
        `gateway is still initialising: required module "${requiredModule}" is not ready. ` +
          `Try again in a few seconds. (${msg})`,
      ),
    });
  }
}
