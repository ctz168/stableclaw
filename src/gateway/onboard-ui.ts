/**
 * Onboard wizard HTTP route handler.
 *
 * Serves the AJAX-based setup wizard at `/onboard` and provides REST API
 * endpoints for configuration bootstrapping.
 *
 * Routes:
 *   GET  /onboard                - HTML wizard page
 *   GET  /api/onboard/status     - Current configuration status
 *   POST /api/onboard/config     - Save a wizard step's configuration
 *   POST /api/onboard/complete   - Finalize setup and optionally install daemon
 *   GET  /api/onboard/providers  - List available AI providers
 *   POST /api/onboard/test-provider - Validate a provider API key
 *   GET  /api/onboard/skills     - List available skills
 *   GET  /api/onboard/hooks      - List available hooks
 *   POST /api/onboard/search-config  - Save search provider config
 *   POST /api/onboard/skills-config  - Save skills preferences
 *   POST /api/onboard/hooks-config   - Save hooks preferences
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
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
    group?: string;
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
  workspaceDir?: string;
  setupMode?: string;
};

type OnboardCompleteRequestBody = {
  workspaceDir?: string;
  customEnv?: string;
  provider?: string;
  model?: string;
  setupMode?: string;
  searchProvider?: string;
  searchApiKey?: string;
  enabledSkills?: string[];
  enabledHooks?: string[];
};

type OnboardSearchConfigRequestBody = {
  provider?: string;
  apiKey?: string;
};

type OnboardSkillsConfigRequestBody = {
  enabled?: string[];
};

type OnboardHooksConfigRequestBody = {
  enabled?: string[];
};

type OnboardSkillsResponse = {
  skills: Array<{
    id: string;
    name: string;
    description: string;
    emoji?: string;
    eligible: boolean;
    status: "eligible" | "missing" | "disabled" | "blocked";
  }>;
};

type OnboardHooksResponse = {
  hooks: Array<{
    id: string;
    name: string;
    description: string;
    emoji?: string;
    loadable: boolean;
  }>;
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
    group: "Major",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
    group: "Major",
  },
  {
    id: "google",
    name: "Google AI",
    envKey: "GEMINI_API_KEY",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    group: "Major",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    models: ["deepseek-chat", "deepseek-reasoner"],
    group: "Popular",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    models: [],
    group: "Popular",
  },
  {
    id: "mistral",
    name: "Mistral",
    envKey: "MISTRAL_API_KEY",
    models: ["mistral-large-latest", "mistral-small-latest"],
    group: "Popular",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    envKey: "XAI_API_KEY",
    models: ["grok-3", "grok-3-mini"],
    group: "Popular",
  },
  {
    id: "together",
    name: "Together AI",
    envKey: "TOGETHER_API_KEY",
    models: [],
    group: "Popular",
  },
  {
    id: "groq",
    name: "Groq",
    envKey: "GROQ_API_KEY",
    models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
    group: "Popular",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    envKey: "FIREWORKS_API_KEY",
    models: [],
    group: "Popular",
  },
  {
    id: "anyscale",
    name: "Anyscale",
    envKey: "ANYSCALE_API_KEY",
    models: [],
    group: "Popular",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    envKey: "PERPLEXITY_API_KEY",
    models: ["sonar-pro", "sonar"],
    group: "Popular",
  },
  {
    id: "volcengine",
    name: "Volcengine (\u5B57\u8282)",
    envKey: "VOLCENGINE_API_KEY",
    models: ["doubao-pro-32k", "doubao-pro-128k"],
    group: "Chinese",
  },
  {
    id: "moonshot",
    name: "Moonshot (\u6708\u4E4B\u6697\u9762)",
    envKey: "MOONSHOT_API_KEY",
    models: ["moonshot-v1-128k", "moonshot-v1-32k"],
    group: "Chinese",
  },
  {
    id: "qianfan",
    name: "Baidu Qianfan (\u767E\u5EA6\u5343\u5E06)",
    envKey: "QIANFAN_API_KEY",
    models: ["ernie-4.0-8k", "ernie-3.5-8k"],
    group: "Chinese",
  },
  {
    id: "zhipuai",
    name: "Zhipu AI (\u667A\u8C31)",
    envKey: "ZHIPUAI_API_KEY",
    models: ["glm-4-plus", "glm-4-flash"],
    group: "Chinese",
  },
  {
    id: "minimax",
    name: "MiniMax",
    envKey: "MINIMAX_API_KEY",
    models: ["abab6.5s-chat", "abab6.5-chat"],
    group: "Chinese",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    envKey: "",
    models: [],
    group: "Self-Hosted",
  },
  {
    id: "lmstudio",
    name: "LM Studio (Local)",
    envKey: "",
    models: [],
    group: "Self-Hosted",
  },
  {
    id: "vllm",
    name: "vLLM (Local)",
    envKey: "",
    models: [],
    group: "Self-Hosted",
  },
  {
    id: "custom",
    name: "Custom (OpenAI-Compatible)",
    envKey: "",
    models: [],
    group: "Other",
  },
] as const;

// ---------------------------------------------------------------------------
// Search providers (hardcoded, no external dependency)
// ---------------------------------------------------------------------------

const SEARCH_PROVIDERS = [
  {
    id: "brave",
    name: "Brave Search",
    envKey: "BRAVE_API_KEY",
    description: "Web search via Brave Search API",
  },
  {
    id: "tavily",
    name: "Tavily",
    envKey: "TAVILY_API_KEY",
    description: "AI-powered search optimized for LLMs",
  },
  {
    id: "searxng",
    name: "SearXNG",
    envKey: "SEARXNG_BASE_URL",
    description: "Self-hosted meta search engine",
  },
  {
    id: "google-pse",
    name: "Google PSE",
    envKey: "GOOGLE_PSE_API_KEY",
    description: "Google Programmable Search Engine",
  },
] as const;

// ---------------------------------------------------------------------------
// Skills catalog (static defaults for wizard display)
// ---------------------------------------------------------------------------

const BUILTIN_SKILLS = [
  { id: "docx", name: "DOCX", description: "Create and edit Word documents", emoji: "\u{1F4C4}" },
  { id: "camsnap", name: "CamSnap", description: "Take photos from webcam", emoji: "\u{1F4F7}" },
  { id: "discord", name: "Discord", description: "Discord channel integration", emoji: "\u{1F6EC}" },
  { id: "notion", name: "Notion", description: "Notion workspace integration", emoji: "\u{1F4D3}" },
  { id: "sherpa-onnx-tts", name: "TTS (Sherpa)", description: "Text-to-speech via Sherpa ONNX", emoji: "\u{1F399}" },
  { id: "model-usage", name: "Model Usage", description: "Track and display model usage stats", emoji: "\u{1F4CA}" },
  { id: "interview-designer", name: "Interview Designer", description: "Design interview guides", emoji: "\u{1F4DD}" },
  { id: "aminer-open-academic", name: "AMiner Academic", description: "Academic paper search", emoji: "\u{1F4DA}" },
  { id: "canvas", name: "Canvas", description: "Visual design canvas tool", emoji: "\u{1F3A8}" },
  { id: "weather", name: "Weather", description: "Get weather forecasts", emoji: "\u26C5" },
  { id: "github", name: "GitHub", description: "GitHub repository integration", emoji: "\u{1F4BB}" },
  { id: "session-logs", name: "Session Logs", description: "Browse and search session logs", emoji: "\u{1F4CB}" },
  { id: "stock-analysis-skill", name: "Stock Analysis", description: "Analyze stocks and markets", emoji: "\u{1F4C8}" },
  { id: "dream-interpreter", name: "Dream Interpreter", description: "Interpret dreams using psychology", emoji: "\u{1F4AD}" },
  { id: "trello", name: "Trello", description: "Trello board integration", emoji: "\u{1F5C3}" },
  { id: "slack", name: "Slack", description: "Slack workspace integration", emoji: "\u{1F4E8}" },
  { id: "gifgrep", name: "GIF Search", description: "Search for GIF images", emoji: "\u{1F3AC}" },
  { id: "songsee", name: "Song Identifier", description: "Identify songs from lyrics", emoji: "\u{1F3B5}" },
  { id: "healthcheck", name: "Health Check", description: "System health monitoring", emoji: "\u{1FA7A}" },
] as const;

// ---------------------------------------------------------------------------
// Hooks catalog (static defaults for wizard display)
// ---------------------------------------------------------------------------

const BUILTIN_HOOKS = [
  { id: "session-memory-on-new", name: "Session Memory on /new", description: "Save session context to memory when starting a new session", emoji: "\u{1F9E0}" },
  { id: "session-summary-on-reset", name: "Session Summary on /reset", description: "Generate a summary before resetting the session", emoji: "\u{1F504}" },
  { id: "auto-compact", name: "Auto Compact", description: "Automatically compact long sessions to save context", emoji: "\u{1F504}" },
  { id: "webhook-on-complete", name: "Webhook on Complete", description: "Send webhook notification when agent completes a task", emoji: "\u{1F517}" },
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
// Provider key -> env var mapping
// ---------------------------------------------------------------------------

function providerEnvVar(provider: string): string {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "google":
      return "GEMINI_API_KEY";
    case "deepseek":
      return "DEEPSEEK_API_KEY";
    case "openrouter":
      return "OPENROUTER_API_KEY";
    case "mistral":
      return "MISTRAL_API_KEY";
    case "xai":
      return "XAI_API_KEY";
    case "together":
      return "TOGETHER_API_KEY";
    case "groq":
      return "GROQ_API_KEY";
    case "fireworks":
      return "FIREWORKS_API_KEY";
    case "anyscale":
      return "ANYSCALE_API_KEY";
    case "perplexity":
      return "PERPLEXITY_API_KEY";
    case "volcengine":
      return "VOLCENGINE_API_KEY";
    case "moonshot":
      return "MOONSHOT_API_KEY";
    case "qianfan":
      return "QIANFAN_API_KEY";
    case "zhipuai":
      return "ZHIPUAI_API_KEY";
    case "minimax":
      return "MINIMAX_API_KEY";
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
    } else if (provider === "deepseek") {
      endpoint = "https://api.deepseek.com/v1/models";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "openrouter") {
      endpoint = "https://openrouter.ai/api/v1/models";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "mistral") {
      endpoint = "https://api.mistral.ai/v1/models";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "xai") {
      endpoint = "https://api.x.ai/v1/models";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "together") {
      endpoint = "https://api.together.xyz/v1/models";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "groq") {
      endpoint = "https://api.groq.com/openai/v1/models";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "fireworks") {
      endpoint = "https://api.fireworks.ai/inference/v1/models";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "perplexity") {
      endpoint = "https://api.perplexity.ai/chat/completions";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "volcengine") {
      endpoint = `https://ark.cn-beijing.volces.com/api/v3/models?key=${apiKey}`;
    } else if (provider === "moonshot") {
      endpoint = "https://api.moonshot.cn/v1/models";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "qianfan") {
      endpoint = `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions?access_token=${apiKey}`;
    } else if (provider === "zhipuai") {
      endpoint = "https://open.bigmodel.cn/api/paas/v4/models";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "minimax") {
      endpoint = "https://api.minimax.chat/v1/text/chatcompletion_v2";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "ollama" && baseUrl) {
      endpoint = `${baseUrl.replace(/\/+$/, "")}/api/tags`;
    } else if (provider === "lmstudio" && baseUrl) {
      endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/models`;
    } else if (provider === "vllm" && baseUrl) {
      endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/models`;
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "custom" && baseUrl) {
      endpoint = `${baseUrl.replace(/\/+$/, "")}/models`;
      headers = { Authorization: `Bearer ${apiKey}` };
    } else {
      return { ok: false, error: "Unsupported provider or missing base URL." };
    }

    // All providers except anthropic use GET /models endpoint
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
    Boolean(envVars.OPENROUTER_API_KEY) ||
    Boolean(envVars.DEEPSEEK_API_KEY) ||
    Boolean(envVars.MISTRAL_API_KEY) ||
    Boolean(envVars.XAI_API_KEY) ||
    Boolean(envVars.TOGETHER_API_KEY) ||
    Boolean(envVars.GROQ_API_KEY) ||
    Boolean(envVars.FIREWORKS_API_KEY) ||
    Boolean(envVars.PERPLEXITY_API_KEY) ||
    Boolean(envVars.VOLCENGINE_API_KEY) ||
    Boolean(envVars.MOONSHOT_API_KEY) ||
    Boolean(envVars.QIANFAN_API_KEY) ||
    Boolean(envVars.ZHIPUAI_API_KEY) ||
    Boolean(envVars.MINIMAX_API_KEY);
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
      group: p.group,
    })),
  };
}

async function handleSkillsRequest(): Promise<OnboardSkillsResponse> {
  // Return static skill catalog. In a real implementation, this would
  // dynamically discover skills from the workspace, but for the wizard
  // we show the built-in catalog.
  return {
    skills: BUILTIN_SKILLS.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      emoji: s.emoji,
      eligible: true,
      status: "eligible" as const,
    })),
  };
}

async function handleHooksRequest(): Promise<OnboardHooksResponse> {
  return {
    hooks: BUILTIN_HOOKS.map((h) => ({
      id: h.id,
      name: h.name,
      description: h.description,
      emoji: h.emoji,
      loadable: true,
    })),
  };
}

async function handleSearchConfigRequest(
  body: OnboardSearchConfigRequestBody,
): Promise<OnboardConfigResponse> {
  try {
    const base = readRawConfig();
    const provider = body.provider;
    const apiKey = body.apiKey?.trim();

    if (!provider) {
      return { ok: false, error: "Search provider is required." };
    }

    const nextConfig: OpenClawConfig = { ...base };

    // Set search provider in config
    const existingTools = base.tools as Record<string, unknown> | undefined;
    const existingWeb = (existingTools?.web ?? {}) as Record<string, unknown>;
    nextConfig.tools = {
      ...existingTools,
      web: {
        ...existingWeb,
        search: {
          provider: provider,
          ...(apiKey ? { apiKey } : {}),
        },
      },
    } as OpenClawConfig["tools"];

    // Set search API key in env vars
    if (apiKey) {
      const searchProvider = SEARCH_PROVIDERS.find((p) => p.id === provider);
      if (searchProvider) {
        const envVars = buildEnvBlock(base.env, "__search_placeholder__", "");
        // Remove the placeholder
        const envKey = searchProvider.envKey;
        if (envKey) {
          envVars[envKey] = apiKey;
        }
        nextConfig.env = {
          ...base.env,
          vars: envVars,
        };
      }
    }

    writeConfigDirect(nextConfig);
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

async function handleSkillsConfigRequest(
  body: OnboardSkillsConfigRequestBody,
): Promise<OnboardConfigResponse> {
  try {
    const base = readRawConfig();
    const enabled = body.enabled ?? [];

    const existingSkills = base.skills ?? {};
    const existingEntries = existingSkills.entries ?? {};
    // Build entries map: set enabled:true for selected skills
    const entries: Record<string, { enabled?: boolean }> = { ...existingEntries };
    for (const skillId of enabled) {
      if (entries[skillId]) {
        entries[skillId] = { ...entries[skillId], enabled: true };
      } else {
        entries[skillId] = { enabled: true };
      }
    }
    const nextConfig: OpenClawConfig = {
      ...base,
      skills: {
        ...existingSkills,
        entries,
      },
    };

    writeConfigDirect(nextConfig);
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

async function handleHooksConfigRequest(
  body: OnboardHooksConfigRequestBody,
): Promise<OnboardConfigResponse> {
  try {
    const base = readRawConfig();
    const enabled = body.enabled ?? [];

    const entries: Record<string, { enabled: boolean }> = {};
    for (const name of enabled) {
      entries[name] = { enabled: true };
    }

    const nextConfig: OpenClawConfig = {
      ...base,
      hooks: {
        ...base.hooks,
        internal: {
          enabled: enabled.length > 0,
          entries,
        },
      },
    };

    writeConfigDirect(nextConfig);
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
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
      const envVars = buildEnvBlock(base.env, provider, apiKey.trim());

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

    if (step === "model") {
      const model = body.model;
      if (!model || typeof model !== "string" || model.trim().length === 0) {
        return { ok: false, error: "Model is required." };
      }

      const nextConfig: OpenClawConfig = {
        ...base,
        agents: {
          ...base.agents,
          defaults: {
            ...base.agents?.defaults,
            model: model.trim(),
          },
        },
      };

      writeConfigDirect(nextConfig);
      return { ok: true };
    }

    if (step === "workspace") {
      const workspaceDir = body.workspaceDir;
      if (!workspaceDir || typeof workspaceDir !== "string" || workspaceDir.trim().length === 0) {
        return { ok: false, error: "Workspace directory is required." };
      }

      const nextConfig: OpenClawConfig = {
        ...base,
        agents: {
          ...base.agents,
          defaults: {
            ...base.agents?.defaults,
            workspace: workspaceDir.trim(),
          },
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

      if (bind === "loopback" || bind === "lan" || bind === "auto" || bind === "tailnet" || bind === "custom") {
        gwConfig.bind = bind;
      }

      // Preserve existing auth token/password when changing mode
      const existingAuth = (base.gateway as Record<string, unknown>)?.auth as Record<string, unknown> | undefined;
      const authConfig: NonNullable<OpenClawConfig["gateway"]>["auth"] = existingAuth
        ? { ...existingAuth }
        : {};
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

      // Handle Tailscale
      const tailscale = (body as Record<string, unknown>).tailscale as string | undefined;
      if (tailscale && gwConfig) {
        (gwConfig as Record<string, unknown>).tailscale = tailscale;
      }

      // Handle custom bind host
      const customBind = (body as Record<string, unknown>).customBind as string | undefined;
      if (customBind && (gwConfig as Record<string, unknown>)) {
        (gwConfig as Record<string, unknown>).customBind = customBind;
      }

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
            if (typeof v === "string") {
              envVars[k] = v;
            }
          }
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") {
              envVars[k] = v;
            }
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

  // GET /api/onboard/skills
  if (subpath === "skills") {
    if (!isReadMethod(req.method)) {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const skills = await handleSkillsRequest();
      if (req.method === "HEAD") {
        res.statusCode = 200;
        res.end();
      } else {
        sendJson(res, 200, skills);
      }
    } catch {
      sendJson(res, 500, { skills: [] });
    }
    return true;
  }

  // GET /api/onboard/hooks
  if (subpath === "hooks") {
    if (!isReadMethod(req.method)) {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const hooks = await handleHooksRequest();
      if (req.method === "HEAD") {
        res.statusCode = 200;
        res.end();
      } else {
        sendJson(res, 200, hooks);
      }
    } catch {
      sendJson(res, 500, { hooks: [] });
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

  // POST /api/onboard/search-config
  if (subpath === "search-config") {
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
      const result = await handleSearchConfigRequest(body.value as OnboardSearchConfigRequestBody);
      sendJson(res, result.ok ? 200 : 400, result);
    } catch {
      sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
    return true;
  }

  // POST /api/onboard/skills-config
  if (subpath === "skills-config") {
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
      const result = await handleSkillsConfigRequest(body.value as OnboardSkillsConfigRequestBody);
      sendJson(res, result.ok ? 200 : 400, result);
    } catch {
      sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
    return true;
  }

  // POST /api/onboard/hooks-config
  if (subpath === "hooks-config") {
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
      const result = await handleHooksConfigRequest(body.value as OnboardHooksConfigRequestBody);
      sendJson(res, result.ok ? 200 : 400, result);
    } catch {
      sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
    return true;
  }

  return false;
}
