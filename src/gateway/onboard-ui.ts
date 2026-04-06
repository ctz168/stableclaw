/**
 * Onboard wizard HTTP route handler.
 *
 * Serves the AJAX-based setup wizard at `/onboard` and provides REST API
 * endpoints for configuration bootstrapping.
 *
 * Routes:
 *   GET  /onboard          - HTML wizard page
 *   GET  /api/onboard/status     - Current configuration status
 *   POST /api/onboard/config     - Save a wizard step's configuration
 *   POST /api/onboard/complete   - Finalize setup and optionally install daemon
 *   GET  /api/onboard/providers  - List available AI providers
 *   POST /api/onboard/test-provider - Validate a provider API key
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  readConfigFileSnapshot,
  CONFIG_PATH,
} from "../config/config.js";
import { resolveGatewayPort } from "../config/paths.js";
import type { OpenClawConfig } from "../config/types.js";
import { buildControlUiCspHeader, computeInlineScriptHashes } from "./control-ui-csp.js";
import { readJsonBody } from "./hooks.js";
import { getOnboardHtml } from "./onboard-page.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OnboardRequestOptions = {
  /**
   * Optional callback invoked when the onboard wizard completes.  The gateway
   * may use this to trigger daemon install / restart flows.
   */
  onComplete?: () => void | Promise<void>;
};

type OnboardStatusResponse = {
  configured: boolean;
  hasConfig: boolean;
  mode: string;
  hasAuth: boolean;
  providerSet: boolean;
  port: number;
};

type OnboardProvidersResponse = {
  providers: Array<{
    id: string;
    name: string;
    envKey: string;
    models?: string[];
  }>;
};

type OnboardConfigRequestBody = {
  step?: string;
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  port?: number;
  bind?: string;
  authMode?: string;
  token?: string;
  password?: string;
};

type OnboardCompleteRequestBody = {
  workspaceDir?: string;
  customEnv?: string;
};

type OnboardConfigResponse = {
  ok: boolean;
  error?: string;
};

type OnboardCompleteResponse = {
  ok: boolean;
  error?: string;
};

type OnboardTestProviderRequestBody = {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

type OnboardTestProviderResponse = {
  ok: boolean;
  error?: string;
};

// ---------------------------------------------------------------------------
// Provider catalog (hardcoded, no external dependency)
// ---------------------------------------------------------------------------

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    envKey: "OPENAI_API_KEY",
    models: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
  },
  {
    id: "google",
    name: "Google AI",
    envKey: "GEMINI_API_KEY",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
  {
    id: "custom",
    name: "Custom (OpenAI-Compatible)",
    envKey: "",
    models: [],
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ONBOARD_HTML_PATHS = ["/onboard", "/onboard/"];
const ONBOARD_API_PREFIX = "/api/onboard/";
const MAX_JSON_BODY = 64 * 1024; // 64 KiB

/**
 * Read the config file directly from disk. Falls back to an empty config
 * if the file doesn't exist or can't be parsed.
 */
function readRawConfig(): OpenClawConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as OpenClawConfig;
  } catch {
    return {};
  }
}

/**
 * Write config directly to disk. This bypasses the config system's
 * replaceConfigFile which requires runtime config snapshot state.
 */
function writeConfigDirect(cfg: OpenClawConfig): void {
  // Ensure state dir exists
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(JSON.stringify(body));
}

function isReadMethod(method: string | undefined): boolean {
  return method === "GET" || method === "HEAD";
}

function resolveApiSubpath(urlRaw: string): string {
  try {
    const url = new URL(urlRaw, "http://localhost");
    const p = url.pathname;
    if (p.startsWith(ONBOARD_API_PREFIX)) {
      return p.slice(ONBOARD_API_PREFIX.length);
    }
  } catch {
    // fall through
  }
  return "";
}

function isOnboardPage(pathname: string): boolean {
  return ONBOARD_HTML_PATHS.some((p) => p === pathname);
}

// ---------------------------------------------------------------------------
// Provider key → env var mapping
// ---------------------------------------------------------------------------

function providerEnvVar(provider: string): string {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "google":
      return "GEMINI_API_KEY";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Provider key testing (lightweight HTTP probe)
// ---------------------------------------------------------------------------

async function testProviderKey(
  provider: string,
  apiKey: string,
  baseUrl?: string,
  model?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    let endpoint = "";
    let headers: Record<string, string> = {};

    if (provider === "openai") {
      endpoint = "https://api.openai.com/v1/models";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "anthropic") {
      endpoint = "https://api.anthropic.com/v1/messages";
      headers = {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      };
      // POST a tiny request since GET /models doesn't exist for Anthropic
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: model || "claude-haiku-4-20250414",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      // 200 means valid key; 400-level may mean valid key but bad payload, still counts.
      if (res.status === 401) {
        return { ok: false, error: "Invalid API key." };
      }
      return { ok: res.status < 500, error: res.status >= 500 ? "Provider returned a server error." : undefined };
    } else if (provider === "google") {
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    } else if (provider === "custom" && baseUrl) {
      endpoint = `${baseUrl.replace(/\/+$/, "")}/models`;
      headers = { Authorization: `Bearer ${apiKey}` };
    } else {
      return { ok: false, error: "Unsupported provider or missing base URL." };
    }

    if (provider !== "anthropic") {
      const res = await fetch(endpoint, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "Invalid API key." };
      }
      if (res.status >= 500) {
        return { ok: false, error: "Provider returned a server error." };
      }
      return { ok: true };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("timeout")) {
      return { ok: false, error: "Connection timed out." };
    }
    return { ok: false, error: `Connection error: ${msg}` };
  }
  return { ok: false, error: "Unexpected error." };
}

// ---------------------------------------------------------------------------
// Build env block for the config from provider selection
// ---------------------------------------------------------------------------

function buildEnvBlock(
  existingEnv: OpenClawConfig["env"] | undefined,
  provider: string,
  apiKey: string,
): Record<string, string> {
  const envVars: Record<string, string> = {};
  if (existingEnv?.vars) {
    for (const [k, v] of Object.entries(existingEnv.vars)) {
      if (typeof v === "string") {
        envVars[k] = v;
      }
    }
  }
  const envKey = providerEnvVar(provider);
  if (envKey) {
    envVars[envKey] = apiKey;
  }
  return envVars;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleStatusRequest(): Promise<OnboardStatusResponse> {
  const cfg = readRawConfig();
  const hasConfig = Object.keys(cfg).length > 0;
  const gw = cfg.gateway;
  // Default to "local" (same as gateway run.ts does)
  const mode = gw?.mode ?? "local";
  const authMode = gw?.auth?.mode;
  const hasAuth = Boolean(
    gw?.auth?.token ||
    gw?.auth?.password ||
    authMode === "token" ||
    authMode === "password" ||
    authMode === "none",
  );
  const envVars = cfg.env?.vars ?? {};
  const providerSet =
    Boolean(envVars.OPENAI_API_KEY) ||
    Boolean(envVars.ANTHROPIC_API_KEY) ||
    Boolean(envVars.GEMINI_API_KEY) ||
    Boolean(envVars.OPENROUTER_API_KEY);
  const port = resolveGatewayPort(cfg);

  // Consider the gateway "configured" if it has auth set up and a provider key.
  const configured = hasConfig && hasAuth && providerSet;

  return { configured, hasConfig, mode, hasAuth, providerSet, port };
}

async function handleProvidersRequest(): Promise<OnboardProvidersResponse> {
  return {
    providers: PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      envKey: p.envKey,
      models: p.models ? [...p.models] : undefined,
    })),
  };
}

async function handleConfigRequest(
  body: OnboardConfigRequestBody,
): Promise<OnboardConfigResponse> {
  try {
    const base = readRawConfig();

    const step = body.step;

    if (step === "provider") {
      const provider = body.provider;
      const apiKey = body.apiKey;

      if (!provider) {
        return { ok: false, error: "Provider is required." };
      }
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
        return { ok: false, error: "API key is required." };
      }

      // Build env vars block
      const envVars = buildEnvBlock(base.env as OpenClawConfig["env"] | undefined, provider, apiKey.trim());

      const nextConfig: OpenClawConfig = {
        ...base,
        env: {
          ...base.env,
          vars: envVars,
        },
      };

      writeConfigDirect(nextConfig);
      return { ok: true };
    }

    if (step === "gateway") {
      const port = body.port;
      const bind = body.bind;
      const authMode = body.authMode;
      const token = body.token;
      const password = body.password;

      const gwConfig: OpenClawConfig["gateway"] = {
        ...(base.gateway as object | undefined),
      };

      if (typeof port === "number" && port > 0) {
        gwConfig.port = port;
      }

      if (bind === "loopback" || bind === "lan" || bind === "auto") {
        gwConfig.bind = bind;
      }

      // Preserve existing auth token/password when changing mode
      const existingAuth = (base.gateway as Record<string, unknown>)?.auth as Record<string, unknown> | undefined;
      const authConfig: NonNullable<OpenClawConfig["gateway"]>["auth"] = {
        ...(existingAuth ?? {}),
      };
      if (authMode === "token" || authMode === "password" || authMode === "none") {
        authConfig.mode = authMode;
      }
      if (authMode === "token" && token) {
        authConfig.token = token;
      }
      if (authMode === "password" && password) {
        authConfig.password = password;
      }
      gwConfig.auth = authConfig;

      const nextConfig: OpenClawConfig = {
        ...base,
        gateway: gwConfig,
      };

      writeConfigDirect(nextConfig);
      return { ok: true };
    }

    return { ok: false, error: `Unknown step: ${step}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

async function handleCompleteRequest(
  body: OnboardCompleteRequestBody,
  opts: OnboardRequestOptions,
): Promise<OnboardCompleteResponse> {
  try {
    const base = readRawConfig();
    let config = { ...base };

    // Apply optional advanced settings
    if (body.customEnv) {
      try {
        const parsed = JSON.parse(body.customEnv);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          const envVars: Record<string, string> = {};
          const existingEnv = config.env?.vars ?? {};
          for (const [k, v] of Object.entries(existingEnv)) {
            if (typeof v === "string") envVars[k] = v;
          }
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") envVars[k] = v;
          }
          config = {
            ...config,
            env: {
              ...config.env,
              vars: envVars,
            },
          };
        }
      } catch {
        // Ignore malformed env JSON
      }
    }

    writeConfigDirect(config);

    // Trigger daemon install / restart callback
    await opts.onComplete?.();

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

async function handleTestProviderRequest(
  body: OnboardTestProviderRequestBody,
): Promise<OnboardTestProviderResponse> {
  const provider = body.provider;
  const apiKey = body.apiKey;

  if (!provider || !apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return { ok: false, error: "Provider and API key are required." };
  }

  return testProviderKey(provider, apiKey.trim(), body.baseUrl, body.model);
}

// ---------------------------------------------------------------------------
// Exported entry point
// ---------------------------------------------------------------------------

export async function handleOnboardHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: OnboardRequestOptions = {},
): Promise<boolean> {
  const urlRaw = req.url;
  if (!urlRaw) {
    return false;
  }

  const url = new URL(urlRaw, "http://localhost");
  const pathname = url.pathname;

  // Serve the wizard HTML page
  if (isOnboardPage(pathname)) {
    if (!isReadMethod(req.method)) {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method Not Allowed");
      return true;
    }
    const html = getOnboardHtml();
    const hashes = computeInlineScriptHashes(html);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Security-Policy", buildControlUiCspHeader({ inlineScriptHashes: hashes }));
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-cache");
    if (req.method === "HEAD") {
      res.end();
    } else {
      res.end(html);
    }
    return true;
  }

  // API routes
  if (!pathname.startsWith(ONBOARD_API_PREFIX)) {
    return false;
  }

  const subpath = resolveApiSubpath(urlRaw);

  // GET /api/onboard/status
  if (subpath === "status") {
    if (!isReadMethod(req.method)) {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const status = await handleStatusRequest();
      if (req.method === "HEAD") {
        res.statusCode = 200;
        res.end();
      } else {
        sendJson(res, 200, status);
      }
    } catch {
      sendJson(res, 500, { configured: false, hasConfig: false, mode: null, hasAuth: false, providerSet: false, port: 18789 });
    }
    return true;
  }

  // GET /api/onboard/providers
  if (subpath === "providers") {
    if (!isReadMethod(req.method)) {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const providers = await handleProvidersRequest();
      if (req.method === "HEAD") {
        res.statusCode = 200;
        res.end();
      } else {
        sendJson(res, 200, providers);
      }
    } catch {
      sendJson(res, 500, { providers: [] });
    }
    return true;
  }

  // POST /api/onboard/config
  if (subpath === "config") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const body = await readJsonBody(req, MAX_JSON_BODY);
      if (!body.ok) {
        const status = body.error === "payload too large" ? 413 : 400;
        sendJson(res, status, { ok: false, error: body.error });
        return true;
      }
      const result = await handleConfigRequest(body.value as OnboardConfigRequestBody);
      sendJson(res, result.ok ? 200 : 400, result);
    } catch {
      sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
    return true;
  }

  // POST /api/onboard/complete
  if (subpath === "complete") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const body = await readJsonBody(req, MAX_JSON_BODY);
      if (!body.ok) {
        const status = body.error === "payload too large" ? 413 : 400;
        sendJson(res, status, { ok: false, error: body.error });
        return true;
      }
      const result = await handleCompleteRequest(body.value as OnboardCompleteRequestBody, opts);
      sendJson(res, result.ok ? 200 : 400, result);
    } catch {
      sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
    return true;
  }

  // POST /api/onboard/test-provider
  if (subpath === "test-provider") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const body = await readJsonBody(req, MAX_JSON_BODY);
      if (!body.ok) {
        const status = body.error === "payload too large" ? 413 : 400;
        sendJson(res, status, { ok: false, error: body.error });
        return true;
      }
      const result = await handleTestProviderRequest(body.value as OnboardTestProviderRequestBody);
      sendJson(res, 200, result);
    } catch {
      sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
    return true;
  }

  return false;
}
