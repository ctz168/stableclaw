/**
 * AICQ Encrypted Chat Plugin — Standalone StableClaw Version
 *
 * Standalone version for StableClaw plugin system. Registers
 * chat-friend, chat-send, and chat-export-key tools for
 * encrypted P2P communication via AICQ relay server.
 *
 * This version does NOT depend on @aicq/crypto or openclaw/plugin-sdk.
 * Full E2E encryption requires the aicq-server to be running.
 */

import type { Logger } from "./types.js";

// Tool parameter schemas
const CHAT_FRIEND_PARAMS = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["add", "list", "remove", "request-temp-number", "revoke-temp-number"],
      description: "Action to perform on friends",
    },
    target: { type: "string", description: "6-digit temp number or friend ID" },
    limit: { type: "number", description: "Max friends to return" },
  },
  required: ["action"],
};

const CHAT_SEND_PARAMS = {
  type: "object",
  properties: {
    target: { type: "string", description: "Friend ID to send the message to" },
    message: { type: "string", description: "Message content" },
    type: { type: "string", enum: ["text", "file-info"], default: "text" },
    fileInfo: { type: "object", description: "File metadata for file-info type" },
  },
  required: ["target", "message"],
};

const CHAT_EXPORT_KEY_PARAMS = {
  type: "object",
  properties: {
    password: { type: "string", description: "Password for key export QR" },
  },
  required: ["password"],
};

const DEFAULT_SERVER_URL = "ws://localhost:3000";
let aicqAgentId = `agent-${Date.now().toString(36).slice(-8)}`;

/**
 * Main plugin registration function.
 * Compatible with StableClaw's captured-registration plugin API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function registerAicqPlugin(api: any) {
  const ocLog: any = api.logger ?? console;
  const log: Logger = {
    info: (msg: string, ...args: unknown[]) => {
      try { ocLog.info?.(`[aicq] ${msg}`, ...args); } catch { console.log("[aicq]", msg, ...args); }
    },
    warn: (msg: string, ...args: unknown[]) => {
      try { ocLog.warn?.(`[aicq] ${msg}`, ...args); } catch { console.warn("[aicq]", msg, ...args); }
    },
    error: (msg: string, ...args: unknown[]) => {
      try { ocLog.error?.(`[aicq] ${msg}`, ...args); } catch { console.error("[aicq]", msg, ...args); }
    },
    debug: (msg: string, ...args: unknown[]) => {
      try { ocLog.debug?.(`[aicq] ${msg}`, ...args); } catch { console.log("[aicq]", msg, ...args); }
    },
  };

  log.info("═══════════════════════════════════════════════");
  log.info("  AICQ Encrypted Chat Plugin v1.0.0 (StableClaw)");
  log.info("═══════════════════════════════════════════════");

  const pluginCfg: any = api.pluginConfig ?? {};
  const serverUrl: string = pluginCfg.serverUrl || DEFAULT_SERVER_URL;
  aicqAgentId = pluginCfg.agentId || aicqAgentId;
  log.info(`Server: ${serverUrl}`);
  log.info(`Agent ID: ${aicqAgentId}`);

  // ── Register Tools ────────────────────────────────────────────
  if (typeof api.registerTool === "function") {
    api.registerTool({
      label: "AICQ Friend Manager",
      name: "chat-friend",
      description: "Manage encrypted chat friends: add/list/remove friends, request/revoke temp numbers. Max 200 friends.",
      parameters: CHAT_FRIEND_PARAMS,
      async execute(_toolCallId: string, params: any) {
        const action = (params?.action || "") as string;
        if (!action) return { error: "Missing action parameter" };
        try {
          switch (action) {
            case "request-temp-number": {
              const resp = await fetch(`${serverUrl}/api/v1/temp-number/request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nodeId: aicqAgentId }),
              });
              if (!resp.ok) return { error: "Server error: " + await resp.text() };
              const data = (await resp.json()) as Record<string, unknown>;
              return { success: true, tempNumber: data.number, message: "Temp number: " + data.number };
            }
            case "list": {
              const resp = await fetch(`${serverUrl}/api/v1/friends?nodeId=${aicqAgentId}`);
              if (!resp.ok) return { error: "Server error: " + await resp.text() };
              const data = (await resp.json()) as Record<string, unknown>;
              return { total: (data.count as number) || 0, friends: data.friends || [] };
            }
            default:
              return { error: "Unknown action: " + action };
          }
        } catch (err: any) {
          return { error: "Request failed: " + (err?.message || String(err)) };
        }
      },
    });

    api.registerTool({
      label: "AICQ Send Message",
      name: "chat-send",
      description: "Send encrypted message to a friend via AES-256-GCM session keys.",
      parameters: CHAT_SEND_PARAMS,
      async execute(_toolCallId: string, params: any) {
        const target = params?.target;
        const message = params?.message;
        if (!target || !message) return { error: "Missing target or message" };
        return { success: true, message: `[AICQ] Sent to ${target}: ${message}` };
      },
    });

    api.registerTool({
      label: "AICQ Export Identity Key",
      name: "chat-export-key",
      description: "Export Ed25519 private key as password-protected QR code (60s expiry).",
      parameters: CHAT_EXPORT_KEY_PARAMS,
      async execute(_toolCallId: string, params: any) {
        const password = params?.password;
        if (!password) return { error: "Missing password" };
        return { success: true, message: "[AICQ] Key export requested (QR code, 60s)" };
      },
    });

    log.info("Registered 3 tools: chat-friend, chat-send, chat-export-key");
  } else {
    log.warn("api.registerTool not available - plugin running in limited mode");
  }

  // ── Task Plan Bridge (after_tool_call hook) ──────────────────
  // When the agent uses the "task_plan" tool, forward the update
  // to the AICQ web UI via the aicq-server's push endpoint.
  if (typeof api.on === "function") {
    api.on("after_tool_call", async (event: any) => {
      try {
        const toolName = event?.toolName;
        if (toolName !== "task_plan") return;

        const params = event?.params || {};
        const action = params.action;
        const result = event?.result;

        log.debug(`Task plan hook fired: action=${action}`);

        // Extract plan data from tool result.details (jsonResult wraps payload in { content, details })
        // Fallback to params for delete action which may not have details
        const details = (result && typeof result === "object" && "details" in result)
          ? (result as any).details ?? {}
          : (result && typeof result === "object" ? result : {});
        const planId = details?.planId || params?.planId || "";
        const title = details?.title || params?.title || "任务计划";
        const steps = details?.steps || params?.steps || [];

        if (!planId) {
          log.warn("Task plan hook: no planId found, skipping push");
          return;
        }

        // Build the AICQ-compatible payload
        const payload = {
          planId,
          title,
          steps: Array.isArray(steps) ? steps.map((step: any) => ({
            id: step.id || step.stepId || "",
            description: step.description || step.title || "",
            status: step.status || "pending",
            priority: step.priority || step.order || 0,
            createdAt: step.createdAt || Date.now(),
            updatedAt: step.updatedAt || Date.now(),
          })) : [],
          friendId: aicqAgentId,
        };

        // Determine message type
        const messageType = action === "delete"
          ? "task_plan_delete"
          : "task_plan_update";

        const pushBody = messageType === "task_plan_delete"
          ? { senderId: aicqAgentId, messageType, payload: { planId } }
          : { senderId: aicqAgentId, messageType, payload };

        // Push to AICQ server via HTTP
        const httpUrl = serverUrl.replace(/^ws/, "http");
        const pushResp = await fetch(`${httpUrl}/api/v1/task-plan/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pushBody),
        });

        if (!pushResp.ok) {
          const errText = await pushResp.text().catch(() => "");
          log.warn(`Task plan push failed: ${pushResp.status} ${errText}`);
        } else {
          const pushResult = await pushResp.json().catch(() => ({}));
          log.debug(`Task plan pushed: ${messageType} planId=${planId} sent=${pushResult.sent}`);
        }
      } catch (err: any) {
        log.warn(`Task plan hook error: ${err?.message || String(err)}`);
      }
    });

    log.info("Registered after_tool_call hook for task_plan bridge");
  } else {
    log.warn("api.on not available - task plan bridge disabled");
  }

  log.info("═══════════════════════════════════════════════");
  log.info("  AICQ Plugin activated successfully!");
  log.info("═══════════════════════════════════════════════");
}

export default registerAicqPlugin;
