import type { OpenClawApp } from "./app.ts";
import { loadDebug } from "./controllers/debug.ts";
import { loadLogs } from "./controllers/logs.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { refreshChatModels } from "./app-chat.ts";

type PollingHost = {
  nodesPollInterval: number | null;
  logsPollInterval: number | null;
  debugPollInterval: number | null;
  modelsPollInterval: number | null;
  connected: boolean;
  tab: string;
  client: unknown;
};

/** Poll the model catalog every 30 seconds so the chat dropdown stays in sync
 *  even if a `config.changed` event was missed (e.g. page was in background). */
export function startModelsPolling(host: PollingHost) {
  if (host.modelsPollInterval != null) {
    return;
  }
  host.modelsPollInterval = window.setInterval(
    () => void refreshChatModels(host as unknown as OpenClawApp),
    30_000,
  );
}

export function stopModelsPolling(host: PollingHost) {
  if (host.modelsPollInterval == null) {
    return;
  }
  clearInterval(host.modelsPollInterval);
  host.modelsPollInterval = null;
}

export function startNodesPolling(host: PollingHost) {
  if (host.nodesPollInterval != null) {
    return;
  }
  host.nodesPollInterval = window.setInterval(
    () => void loadNodes(host as unknown as OpenClawApp, { quiet: true }),
    5000,
  );
}

export function stopNodesPolling(host: PollingHost) {
  if (host.nodesPollInterval == null) {
    return;
  }
  clearInterval(host.nodesPollInterval);
  host.nodesPollInterval = null;
}

export function startLogsPolling(host: PollingHost) {
  if (host.logsPollInterval != null) {
    return;
  }
  host.logsPollInterval = window.setInterval(() => {
    if (host.tab !== "logs") {
      return;
    }
    void loadLogs(host as unknown as OpenClawApp, { quiet: true });
  }, 2000);
}

export function stopLogsPolling(host: PollingHost) {
  if (host.logsPollInterval == null) {
    return;
  }
  clearInterval(host.logsPollInterval);
  host.logsPollInterval = null;
}

export function startDebugPolling(host: PollingHost) {
  if (host.debugPollInterval != null) {
    return;
  }
  host.debugPollInterval = window.setInterval(() => {
    if (host.tab !== "debug") {
      return;
    }
    void loadDebug(host as unknown as OpenClawApp);
  }, 3000);
}

export function stopDebugPolling(host: PollingHost) {
  if (host.debugPollInterval == null) {
    return;
  }
  clearInterval(host.debugPollInterval);
  host.debugPollInterval = null;
}

/**
 * Chat polling has been removed in favor of event-driven updates.
 * The WebSocket connection already pushes chat events (delta, final, aborted, error)
 * in real-time, and handleChatEvent in controllers/chat.ts handles incremental
 * message updates. History is loaded only on initial connect, session switch,
 * reconnect, or when tool events require persisted results.
 */
