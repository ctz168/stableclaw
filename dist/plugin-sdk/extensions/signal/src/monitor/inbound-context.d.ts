import { resolveChannelContextVisibilityMode } from "openclaw/plugin-sdk/config-runtime";
import { type ContextVisibilityDecision } from "openclaw/plugin-sdk/security-runtime";
import type { SignalDataMessage } from "./event-handler.types.js";
export type SignalQuoteContext = {
    contextVisibilityMode: ReturnType<typeof resolveChannelContextVisibilityMode>;
    decision: ContextVisibilityDecision;
    quoteSenderAllowed: boolean;
    visibleQuoteText: string;
    visibleQuoteSender?: string;
};
export declare function resolveSignalQuoteContext(params: {
    cfg: Parameters<typeof resolveChannelContextVisibilityMode>[0]["cfg"];
    accountId: string;
    isGroup: boolean;
    dataMessage?: SignalDataMessage | null;
    effectiveGroupAllow: string[];
}): SignalQuoteContext;
