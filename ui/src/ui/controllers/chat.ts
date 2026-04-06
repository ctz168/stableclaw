import { resetToolStream } from "../app-tool-stream.ts";
import { extractText } from "../chat/message-extract.ts";
import { formatConnectError } from "../connect-error.ts";
import type { GatewayBrowserClient } from "../gateway.ts";
import type { ChatAttachment } from "../ui-types.ts";
import { generateUUID } from "../uuid.ts";
import {
  formatMissingOperatorReadScopeMessage,
  isMissingOperatorReadScopeError,
} from "./scope-errors.ts";

const SILENT_REPLY_PATTERN = /^\s*NO_REPLY\s*$/;

/** Maximum time (ms) a chat run can be active before the client auto-recovers.
 *  If no terminal event (final/error/aborted) arrives within this window, the
 *  client clears the stuck run state so the user can send new messages. */
const CHAT_RUN_TIMEOUT_MS = 300_000; // 5 minutes

function isSilentReplyStream(text: string): boolean {
  return SILENT_REPLY_PATTERN.test(text);
}
/** Client-side defense-in-depth: detect assistant messages whose text is purely NO_REPLY. */
function isAssistantSilentReply(message: unknown): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }
  const entry = message as Record<string, unknown>;
  const role = typeof entry.role === "string" ? entry.role.toLowerCase() : "";
  if (role !== "assistant") {
    return false;
  }
  // entry.text takes precedence — matches gateway extractAssistantTextForSilentCheck
  if (typeof entry.text === "string") {
    return isSilentReplyStream(entry.text);
  }
  const text = extractText(message);
  return typeof text === "string" && isSilentReplyStream(text);
}

export type ChatState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey: string;
  chatLoading: boolean;
  chatMessages: unknown[];
  chatThinkingLevel: string | null;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatRunId: string | null;
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  lastError: string | null;
};

/** Extended chat state with AJAX cache support (used internally). */
export type ChatStateWithCache = ChatState & {
  chatLastRefreshedAt: number;
  chatBackgroundRefreshInFlight: boolean;
};

/** Cache accessors for session-based chat history caching. */
export type ChatCacheAccessors = {
  restoreFromCache: (sessionKey: string) => boolean;
};

export type LoadChatHistoryOptions = {
  /** If true, load without showing loading skeleton (silent AJAX refresh). */
  background?: boolean;
  /** If true, skip the load entirely if data was refreshed recently. */
  skipIfFresh?: boolean;
  /** Maximum age in ms before data is considered stale (default 30s). */
  staleThresholdMs?: number;
};

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

function maybeResetToolStream(state: ChatState) {
  const toolHost = state as ChatState & Partial<Parameters<typeof resetToolStream>[0]>;
  if (
    toolHost.toolStreamById instanceof Map &&
    Array.isArray(toolHost.toolStreamOrder) &&
    Array.isArray(toolHost.chatToolMessages) &&
    Array.isArray(toolHost.chatStreamSegments)
  ) {
    resetToolStream(toolHost as Parameters<typeof resetToolStream>[0]);
  }
}

/** Timer ID for the chat run watchdog. */
let chatRunWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Start a watchdog timer that auto-recovers from stuck chat runs.
 * If the run is still active after CHAT_RUN_TIMEOUT_MS, the client
 * clears the stuck state and shows an error so the user can retry.
 */
function startChatRunWatchdog(state: ChatState) {
  stopChatRunWatchdog();
  chatRunWatchdogTimer = setTimeout(() => {
    chatRunWatchdogTimer = null;
    if (state.chatRunId && state.connected) {
      const elapsed = state.chatStreamStartedAt
        ? Date.now() - state.chatStreamStartedAt
        : 0;
      const timedOutRunId = state.chatRunId;
      const streamedText = state.chatStream?.trim();
      // Promote any streamed text into the message list before clearing
      if (streamedText && !isSilentReplyStream(streamedText)) {
        state.chatMessages = [
          ...state.chatMessages,
          {
            role: "assistant",
            content: [{ type: "text", text: streamedText }],
            timestamp: Date.now(),
          },
        ];
      }
      state.chatRunId = null;
      state.chatStream = null;
      state.chatStreamStartedAt = null;
      state.lastError = `Response timed out after ${Math.round(elapsed / 1000)}s (runId: ${timedOutRunId.slice(0, 8)}). The message was sent but the server did not complete the response.`;
    }
  }, CHAT_RUN_TIMEOUT_MS);
}

/** Stop the chat run watchdog timer. */
function stopChatRunWatchdog() {
  if (chatRunWatchdogTimer !== null) {
    clearTimeout(chatRunWatchdogTimer);
    chatRunWatchdogTimer = null;
  }
}

/**
 * Default staleness threshold in ms — data fresher than this won't trigger
 * a background reload unless forced.
 */
const DEFAULT_STALE_THRESHOLD_MS = 30_000;

export async function loadChatHistory(state: ChatState, options?: LoadChatHistoryOptions) {
  if (!state.client || !state.connected) {
    return;
  }

  const isBackground = Boolean(options?.background);
  const staleThresholdMs = options?.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;
  const cache = state as unknown as Partial<ChatStateWithCache>;

  // Skip if data is fresh and this is a background/stale check
  if (options?.skipIfFresh && cache.chatLastRefreshedAt) {
    const age = Date.now() - cache.chatLastRefreshedAt;
    if (age < staleThresholdMs) {
      return;
    }
  }

  // Prevent duplicate background refreshes
  if (isBackground && cache.chatBackgroundRefreshInFlight) {
    return;
  }

  // Only show loading skeleton for foreground (non-background) loads
  if (!isBackground) {
    state.chatLoading = true;
  }
  state.lastError = null;

  if (isBackground) {
    cache.chatBackgroundRefreshInFlight = true;
  }

  try {
    const res = await state.client.request<{ messages?: Array<unknown>; thinkingLevel?: string }>(
      "chat.history",
      {
        sessionKey: state.sessionKey,
        limit: 200,
      },
    );
    const messages = Array.isArray(res.messages) ? res.messages : [];
    const filteredMessages = messages.filter((message) => !isAssistantSilentReply(message));
    state.chatMessages = filteredMessages;
    state.chatThinkingLevel = res.thinkingLevel ?? null;
    cache.chatLastRefreshedAt = Date.now();
    // Clear all streaming state — history includes tool results and text
    // inline, so keeping streaming artifacts would cause duplicates.
    maybeResetToolStream(state);
    state.chatStream = null;
    state.chatStreamStartedAt = null;
  } catch (err) {
    if (isMissingOperatorReadScopeError(err)) {
      state.chatMessages = [];
      state.chatThinkingLevel = null;
      state.lastError = formatMissingOperatorReadScopeMessage("existing chat history");
    } else if (!isBackground) {
      // Only surface non-background errors to avoid noise
      state.lastError = String(err);
    }
  } finally {
    if (!isBackground) {
      state.chatLoading = false;
    }
    cache.chatBackgroundRefreshInFlight = false;
  }
}

/**
 * Smart chat history loader with caching:
 * 1. Tries to restore from cache for instant display
 * 2. Always refreshes in background to get latest data
 * 3. Only shows loading skeleton when no cache is available
 */
export async function loadChatHistoryWithCache(
  state: ChatState,
  cacheAccessors?: ChatCacheAccessors,
) {
  if (!state.client || !state.connected) {
    return;
  }

  // Try to restore from cache for instant display
  const hadCache = cacheAccessors?.restoreFromCache(state.sessionKey) ?? false;

  if (hadCache) {
    // We have cached data — do a silent background refresh
    await loadChatHistory(state, { background: true });
  } else {
    // No cache — do a full foreground load with loading skeleton
    await loadChatHistory(state);
  }
}

/**
 * Background-only refresh that only fetches if data is stale.
 * Ideal for tab switches where we want seamless UX.
 */
export async function refreshChatHistoryIfNeeded(state: ChatState) {
  await loadChatHistory(state, { background: true, skipIfFresh: true });
}

function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

type AssistantMessageNormalizationOptions = {
  roleRequirement: "required" | "optional";
  roleCaseSensitive?: boolean;
  requireContentArray?: boolean;
  allowTextField?: boolean;
};

function normalizeAssistantMessage(
  message: unknown,
  options: AssistantMessageNormalizationOptions,
): Record<string, unknown> | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const candidate = message as Record<string, unknown>;
  const roleValue = candidate.role;
  if (typeof roleValue === "string") {
    const role = options.roleCaseSensitive ? roleValue : roleValue.toLowerCase();
    if (role !== "assistant") {
      return null;
    }
  } else if (options.roleRequirement === "required") {
    return null;
  }

  if (options.requireContentArray) {
    return Array.isArray(candidate.content) ? candidate : null;
  }
  if (!("content" in candidate) && !(options.allowTextField && "text" in candidate)) {
    return null;
  }
  return candidate;
}

function normalizeAbortedAssistantMessage(message: unknown): Record<string, unknown> | null {
  return normalizeAssistantMessage(message, {
    roleRequirement: "required",
    roleCaseSensitive: true,
    requireContentArray: true,
  });
}

function normalizeFinalAssistantMessage(message: unknown): Record<string, unknown> | null {
  return normalizeAssistantMessage(message, {
    roleRequirement: "optional",
    allowTextField: true,
  });
}

export async function sendChatMessage(
  state: ChatState,
  message: string,
  attachments?: ChatAttachment[],
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  const msg = message.trim();
  const hasAttachments = attachments && attachments.length > 0;
  if (!msg && !hasAttachments) {
    return null;
  }

  const now = Date.now();

  // Build user message content blocks
  const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
  if (msg) {
    contentBlocks.push({ type: "text", text: msg });
  }
  // Add image previews to the message for display
  if (hasAttachments) {
    for (const att of attachments) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: att.mimeType, data: att.dataUrl },
      });
    }
  }

  state.chatMessages = [
    ...state.chatMessages,
    {
      role: "user",
      content: contentBlocks,
      timestamp: now,
    },
  ];

  state.chatSending = true;
  state.lastError = null;
  const runId = generateUUID();
  state.chatRunId = runId;
  state.chatStream = "";
  state.chatStreamStartedAt = now;
  // Start watchdog to auto-recover if the server never sends a terminal event
  startChatRunWatchdog(state);

  // Convert attachments to API format
  const apiAttachments = hasAttachments
    ? attachments
        .map((att) => {
          const parsed = dataUrlToBase64(att.dataUrl);
          if (!parsed) {
            return null;
          }
          return {
            type: "image",
            mimeType: parsed.mimeType,
            content: parsed.content,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null)
    : undefined;

  try {
    await state.client.request("chat.send", {
      sessionKey: state.sessionKey,
      message: msg,
      deliver: false,
      idempotencyKey: runId,
      attachments: apiAttachments,
    });
    return runId;
  } catch (err) {
    stopChatRunWatchdog();
    const error = formatConnectError(err);
    state.chatRunId = null;
    state.chatStream = null;
    state.chatStreamStartedAt = null;
    state.lastError = error;
    state.chatMessages = [
      ...state.chatMessages,
      {
        role: "assistant",
        content: [{ type: "text", text: "Error: " + error }],
        timestamp: Date.now(),
      },
    ];
    return null;
  } finally {
    state.chatSending = false;
  }
}

export async function abortChatRun(state: ChatState): Promise<boolean> {
  if (!state.client || !state.connected) {
    return false;
  }
  const runId = state.chatRunId;
  try {
    await state.client.request(
      "chat.abort",
      runId ? { sessionKey: state.sessionKey, runId } : { sessionKey: state.sessionKey },
    );
    return true;
  } catch (err) {
    state.lastError = formatConnectError(err);
    return false;
  }
}

export function handleChatEvent(state: ChatState, payload?: ChatEventPayload) {
  if (!payload) {
    return null;
  }
  if (payload.sessionKey !== state.sessionKey) {
    return null;
  }

  // Final from another run (e.g. sub-agent announce): refresh history to show new message.
  // See https://github.com/openclaw/openclaw/issues/1909
  if (payload.runId && state.chatRunId && payload.runId !== state.chatRunId) {
    if (payload.state === "final") {
      const finalMessage = normalizeFinalAssistantMessage(payload.message);
      if (finalMessage && !isAssistantSilentReply(finalMessage)) {
        state.chatMessages = [...state.chatMessages, finalMessage];
        return null;
      }
      return "final";
    }
    return null;
  }

  if (payload.state === "delta") {
    const next = extractText(payload.message);
    if (typeof next === "string" && !isSilentReplyStream(next)) {
      state.chatStream = next;
    }
  } else if (payload.state === "final") {
    stopChatRunWatchdog();
    const finalMessage = normalizeFinalAssistantMessage(payload.message);
    if (finalMessage && !isAssistantSilentReply(finalMessage)) {
      state.chatMessages = [...state.chatMessages, finalMessage];
    } else if (state.chatStream?.trim() && !isSilentReplyStream(state.chatStream)) {
      state.chatMessages = [
        ...state.chatMessages,
        {
          role: "assistant",
          content: [{ type: "text", text: state.chatStream }],
          timestamp: Date.now(),
        },
      ];
    }
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
  } else if (payload.state === "aborted") {
    stopChatRunWatchdog();
    const normalizedMessage = normalizeAbortedAssistantMessage(payload.message);
    if (normalizedMessage && !isAssistantSilentReply(normalizedMessage)) {
      state.chatMessages = [...state.chatMessages, normalizedMessage];
    } else {
      const streamedText = state.chatStream ?? "";
      if (streamedText.trim() && !isSilentReplyStream(streamedText)) {
        state.chatMessages = [
          ...state.chatMessages,
          {
            role: "assistant",
            content: [{ type: "text", text: streamedText }],
            timestamp: Date.now(),
          },
        ];
      }
    }
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
  } else if (payload.state === "error") {
    stopChatRunWatchdog();
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    state.lastError = payload.errorMessage ?? "chat error";
  }
  return payload.state;
}
