import type { WebInboundMsg } from "../types.js";
import { type GroupHistoryEntry } from "./inbound-context.js";
import { type getChildLogger, type getReplyFromConfig, type loadConfig, type resolveAgentRoute } from "./runtime-api.js";
export declare function processMessage(params: {
    cfg: ReturnType<typeof loadConfig>;
    msg: WebInboundMsg;
    route: ReturnType<typeof resolveAgentRoute>;
    groupHistoryKey: string;
    groupHistories: Map<string, GroupHistoryEntry[]>;
    groupMemberNames: Map<string, Map<string, string>>;
    connectionId: string;
    verbose: boolean;
    maxMediaBytes: number;
    replyResolver: typeof getReplyFromConfig;
    replyLogger: ReturnType<typeof getChildLogger>;
    backgroundTasks: Set<Promise<unknown>>;
    rememberSentText: (text: string | undefined, opts: {
        combinedBody?: string;
        combinedBodySessionKey?: string;
        logVerboseMessage?: boolean;
    }) => void;
    echoHas: (key: string) => boolean;
    echoForget: (key: string) => void;
    buildCombinedEchoKey: (p: {
        sessionKey: string;
        combinedBody: string;
    }) => string;
    maxMediaTextChunkLimit?: number;
    groupHistory?: GroupHistoryEntry[];
    suppressGroupHistoryClear?: boolean;
}): Promise<boolean>;
