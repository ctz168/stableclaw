import type { WebInboundMsg } from "../types.js";
import type { GroupHistoryEntry } from "./inbound-context.js";
import { createChannelReplyPipeline, resolveChunkMode, resolveMarkdownTableMode, type getChildLogger, type getReplyFromConfig, type loadConfig, type ReplyPayload, type resolveAgentRoute } from "./runtime-api.js";
type ChannelReplyOnModelSelected = NonNullable<ReturnType<typeof createChannelReplyPipeline>["onModelSelected"]>;
type WhatsAppDispatchPipeline = {
    responsePrefix?: string;
} & Record<string, unknown>;
type VisibleReplyTarget = {
    id?: string;
    body?: string;
    sender?: {
        label?: string | null;
    } | null;
};
type SenderContext = {
    id?: string;
    name?: string;
    e164?: string;
};
export declare function resolveWhatsAppResponsePrefix(params: {
    cfg: ReturnType<typeof loadConfig>;
    agentId: string;
    isSelfChat: boolean;
    pipelineResponsePrefix?: string;
}): string | undefined;
export declare function buildWhatsAppInboundContext(params: {
    combinedBody: string;
    commandAuthorized?: boolean;
    conversationId: string;
    groupHistory?: GroupHistoryEntry[];
    groupMemberRoster?: Map<string, string>;
    msg: WebInboundMsg;
    route: ReturnType<typeof resolveAgentRoute>;
    sender: SenderContext;
    visibleReplyTo?: VisibleReplyTarget;
}): {
    Provider: string;
    Surface: string;
    OriginatingChannel: string;
    OriginatingTo: string;
    LocationLat?: number | undefined;
    LocationLon?: number | undefined;
    LocationAccuracy?: number;
    LocationName?: string;
    LocationAddress?: string;
    LocationSource?: import("../../../../../src/channels/location.ts").LocationSource | undefined;
    LocationIsLive?: boolean | undefined;
    Body: string;
    BodyForAgent: string;
    InboundHistory: {
        sender: string;
        body: string;
        timestamp: number | undefined;
    }[] | undefined;
    RawBody: string;
    CommandBody: string;
    From: string;
    To: string;
    SessionKey: string;
    AccountId: string;
    MessageSid: string | undefined;
    ReplyToId: string | undefined;
    ReplyToBody: string | undefined;
    ReplyToSender: string | null | undefined;
    MediaPath: string | undefined;
    MediaUrl: string | undefined;
    MediaType: string | undefined;
    ChatType: "direct" | "group";
    Timestamp: number | undefined;
    ConversationLabel: string;
    GroupSubject: string | undefined;
    GroupMembers: string | undefined;
    SenderName: string | undefined;
    SenderId: string | undefined;
    SenderE164: string | undefined;
    CommandAuthorized: boolean | undefined;
    WasMentioned: boolean | undefined;
} & Omit<import("openclaw/plugin-sdk/reply-runtime").MsgContext, "CommandAuthorized"> & {
    CommandAuthorized: boolean;
};
export declare function resolveWhatsAppDmRouteTarget(params: {
    msg: WebInboundMsg;
    senderE164?: string;
    normalizeE164: (value: string) => string | null;
}): string | undefined;
export declare function updateWhatsAppMainLastRoute(params: {
    backgroundTasks: Set<Promise<unknown>>;
    cfg: ReturnType<typeof loadConfig>;
    ctx: Record<string, unknown>;
    dmRouteTarget?: string;
    pinnedMainDmRecipient: string | null;
    route: ReturnType<typeof resolveAgentRoute>;
    updateLastRoute: (params: {
        cfg: ReturnType<typeof loadConfig>;
        backgroundTasks: Set<Promise<unknown>>;
        storeAgentId: string;
        sessionKey: string;
        channel: "whatsapp";
        to: string;
        accountId?: string;
        ctx: Record<string, unknown>;
        warn: ReturnType<typeof getChildLogger>["warn"];
    }) => void;
    warn: ReturnType<typeof getChildLogger>["warn"];
}): void;
export declare function dispatchWhatsAppBufferedReply(params: {
    cfg: ReturnType<typeof loadConfig>;
    connectionId: string;
    context: Record<string, unknown>;
    conversationId: string;
    deliverReply: (params: {
        replyResult: ReplyPayload;
        msg: WebInboundMsg;
        mediaLocalRoots: readonly string[];
        maxMediaBytes: number;
        textLimit: number;
        chunkMode?: ReturnType<typeof resolveChunkMode>;
        replyLogger: ReturnType<typeof getChildLogger>;
        connectionId?: string;
        skipLog?: boolean;
        tableMode?: ReturnType<typeof resolveMarkdownTableMode>;
    }) => Promise<void>;
    groupHistories: Map<string, GroupHistoryEntry[]>;
    groupHistoryKey: string;
    maxMediaBytes: number;
    maxMediaTextChunkLimit?: number;
    msg: WebInboundMsg;
    onModelSelected?: ChannelReplyOnModelSelected | undefined;
    rememberSentText: (text: string | undefined, opts: {
        combinedBody?: string;
        combinedBodySessionKey?: string;
        logVerboseMessage?: boolean;
    }) => void;
    replyLogger: ReturnType<typeof getChildLogger>;
    replyPipeline: WhatsAppDispatchPipeline;
    replyResolver: typeof getReplyFromConfig;
    route: ReturnType<typeof resolveAgentRoute>;
    shouldClearGroupHistory: boolean;
}): Promise<boolean>;
export {};
