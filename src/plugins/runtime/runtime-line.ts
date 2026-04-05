import { loadSiblingRuntimeModuleSync } from "./local-runtime-module.js";
import type { PluginRuntimeChannel } from "./types-channel.js";

type RuntimeLineModule = {
  runtimeLine: PluginRuntimeChannel["line"];
};

let cachedRuntimeLineModule: RuntimeLineModule | null = null;

function loadRuntimeLineModule(): RuntimeLineModule {
  cachedRuntimeLineModule ??= loadSiblingRuntimeModuleSync<RuntimeLineModule>({
    moduleUrl: import.meta.url,
    relativeBase: "./runtime-line.contract",
  });
  return cachedRuntimeLineModule;
}

// Use `as any` for the module reference to avoid TS2556 spread errors with
// non-rest typed delegate methods across the module boundary.
const rl = () => loadRuntimeLineModule().runtimeLine as any;

export function createRuntimeLine(): PluginRuntimeChannel["line"] {
  return {
    listLineAccountIds: (...args: any[]) => rl().listLineAccountIds(...args),
    resolveDefaultLineAccountId: (...args: any[]) =>
      rl().resolveDefaultLineAccountId(...args),
    resolveLineAccount: (...args: any[]) => rl().resolveLineAccount(...args),
    normalizeAccountId: (...args: any[]) => rl().normalizeAccountId(...args),
    probeLineBot: (...args: any[]) => rl().probeLineBot(...args),
    sendMessageLine: (...args: any[]) => rl().sendMessageLine(...args),
    pushMessageLine: (...args: any[]) => rl().pushMessageLine(...args),
    pushMessagesLine: (...args: any[]) => rl().pushMessagesLine(...args),
    pushFlexMessage: (...args: any[]) => rl().pushFlexMessage(...args),
    pushTemplateMessage: (...args: any[]) => rl().pushTemplateMessage(...args),
    pushLocationMessage: (...args: any[]) => rl().pushLocationMessage(...args),
    pushTextMessageWithQuickReplies: (...args: any[]) =>
      rl().pushTextMessageWithQuickReplies(...args),
    createQuickReplyItems: (...args: any[]) => rl().createQuickReplyItems(...args),
    buildTemplateMessageFromPayload: (...args: any[]) =>
      rl().buildTemplateMessageFromPayload(...args),
    monitorLineProvider: (...args: any[]) => rl().monitorLineProvider(...args),
  };
}
