import { type DiscordChannelConfigResolved, type DiscordGuildEntryResolved } from "./allow-list.js";
export type DiscordSupplementalContextSender = {
    id?: string;
    name?: string;
    tag?: string;
    memberRoleIds?: string[];
};
export declare function createDiscordSupplementalContextAccessChecker(params: {
    channelConfig?: DiscordChannelConfigResolved | null;
    guildInfo?: DiscordGuildEntryResolved | null;
    allowNameMatching?: boolean;
    isGuild: boolean;
}): (sender: DiscordSupplementalContextSender) => boolean;
export declare function buildDiscordGroupSystemPrompt(channelConfig?: DiscordChannelConfigResolved | null): string | undefined;
export declare function buildDiscordUntrustedContext(params: {
    isGuild: boolean;
    channelTopic?: string;
    messageBody?: string;
}): string[] | undefined;
export declare function buildDiscordInboundAccessContext(params: {
    channelConfig?: DiscordChannelConfigResolved | null;
    guildInfo?: DiscordGuildEntryResolved | null;
    sender: {
        id: string;
        name?: string;
        tag?: string;
    };
    allowNameMatching?: boolean;
    isGuild: boolean;
    channelTopic?: string;
    messageBody?: string;
}): {
    groupSystemPrompt: string | undefined;
    untrustedContext: string[] | undefined;
    ownerAllowFrom: string[] | undefined;
};
