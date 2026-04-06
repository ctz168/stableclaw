import { u as isRecord } from "./utils-CN_F_3Qg.js";
import { _ as normalizeAccountId } from "./session-key-Do__tq1E.js";
import { t as normalizeAtHashSlug } from "./string-normalization-Ddc4JXRe.js";
import { a as resolveEnabledConfiguredAccountId, n as asString, t as appendMatchMetadata } from "./shared-BsLpgVLV.js";
import "./status-helpers-CCJSSrVJ.js";
import { i as resolveToolsBySender } from "./group-policy-G9GcSyph.js";
import "./core-CKHoDVyA.js";
import "./channel-policy-DmKXVkPA.js";
import "./directory-runtime-B-PU5LUt.js";
import { i as createResolvedDirectoryEntriesLister } from "./directory-config-helpers-DBmVJY3U.js";
import { a as resolveDefaultDiscordAccountId, i as mergeDiscordAccountConfig } from "./accounts-5jDftSKh.js";
//#region extensions/discord/src/directory-config.ts
function resolveDiscordDirectoryConfigAccount(cfg, accountId) {
	const resolvedAccountId = normalizeAccountId(accountId ?? resolveDefaultDiscordAccountId(cfg));
	const config = mergeDiscordAccountConfig(cfg, resolvedAccountId);
	return {
		accountId: resolvedAccountId,
		config,
		dm: config.dm
	};
}
const listDiscordDirectoryPeersFromConfig = createResolvedDirectoryEntriesLister({
	kind: "user",
	resolveAccount: (cfg, accountId) => resolveDiscordDirectoryConfigAccount(cfg, accountId),
	resolveSources: (account) => {
		const allowFrom = account.config.allowFrom ?? account.config.dm?.allowFrom ?? [];
		const guildUsers = Object.values(account.config.guilds ?? {}).flatMap((guild) => [...guild.users ?? [], ...Object.values(guild.channels ?? {}).flatMap((channel) => channel.users ?? [])]);
		return [
			allowFrom,
			Object.keys(account.config.dms ?? {}),
			guildUsers
		];
	},
	normalizeId: (raw) => {
		const cleaned = (raw.match(/^<@!?(\d+)>$/)?.[1] ?? raw).replace(/^(discord|user):/i, "").trim();
		return /^\d+$/.test(cleaned) ? `user:${cleaned}` : null;
	}
});
const listDiscordDirectoryGroupsFromConfig = createResolvedDirectoryEntriesLister({
	kind: "group",
	resolveAccount: (cfg, accountId) => resolveDiscordDirectoryConfigAccount(cfg, accountId),
	resolveSources: (account) => Object.values(account.config.guilds ?? {}).map((guild) => Object.keys(guild.channels ?? {})),
	normalizeId: (raw) => {
		const cleaned = (raw.match(/^<#(\d+)>$/)?.[1] ?? raw).replace(/^(discord|channel|group):/i, "").trim();
		return /^\d+$/.test(cleaned) ? `channel:${cleaned}` : null;
	}
});
//#endregion
//#region extensions/discord/src/group-policy.ts
function normalizeDiscordSlug(value) {
	return normalizeAtHashSlug(value);
}
function resolveDiscordGuildEntry(guilds, groupSpace) {
	if (!guilds || Object.keys(guilds).length === 0) return null;
	const space = groupSpace?.trim() ?? "";
	if (space && guilds[space]) return guilds[space];
	const normalized = normalizeDiscordSlug(space);
	if (normalized && guilds[normalized]) return guilds[normalized];
	if (normalized) {
		const match = Object.values(guilds).find((entry) => normalizeDiscordSlug(entry?.slug ?? void 0) === normalized);
		if (match) return match;
	}
	return guilds["*"] ?? null;
}
function resolveDiscordChannelEntry(channelEntries, params) {
	if (!channelEntries || Object.keys(channelEntries).length === 0) return;
	const groupChannel = params.groupChannel;
	const channelSlug = normalizeDiscordSlug(groupChannel);
	return (params.groupId ? channelEntries[params.groupId] : void 0) ?? (channelSlug ? channelEntries[channelSlug] ?? channelEntries[`#${channelSlug}`] : void 0) ?? (groupChannel ? channelEntries[normalizeDiscordSlug(groupChannel)] : void 0);
}
function resolveSenderToolsEntry(entry, params) {
	if (!entry) return;
	return resolveToolsBySender({
		toolsBySender: entry.toolsBySender,
		senderId: params.senderId,
		senderName: params.senderName,
		senderUsername: params.senderUsername,
		senderE164: params.senderE164
	}) ?? entry.tools;
}
function resolveDiscordPolicyContext(params) {
	const guildEntry = resolveDiscordGuildEntry(params.cfg.channels?.discord?.guilds, params.groupSpace);
	const channelEntries = guildEntry?.channels;
	return {
		guildEntry,
		channelEntry: channelEntries && Object.keys(channelEntries).length > 0 ? resolveDiscordChannelEntry(channelEntries, params) : void 0
	};
}
function resolveDiscordGroupRequireMention(params) {
	const context = resolveDiscordPolicyContext(params);
	if (typeof context.channelEntry?.requireMention === "boolean") return context.channelEntry.requireMention;
	if (typeof context.guildEntry?.requireMention === "boolean") return context.guildEntry.requireMention;
	return true;
}
function resolveDiscordGroupToolPolicy(params) {
	const context = resolveDiscordPolicyContext(params);
	const channelPolicy = resolveSenderToolsEntry(context.channelEntry, params);
	if (channelPolicy) return channelPolicy;
	return resolveSenderToolsEntry(context.guildEntry, params);
}
//#endregion
//#region extensions/discord/src/status-issues.ts
function readDiscordAccountStatus(value) {
	if (!isRecord(value)) return null;
	return {
		accountId: value.accountId,
		enabled: value.enabled,
		configured: value.configured,
		application: value.application,
		audit: value.audit
	};
}
function readDiscordApplicationSummary(value) {
	if (!isRecord(value)) return {};
	const intentsRaw = value.intents;
	if (!isRecord(intentsRaw)) return {};
	return { intents: { messageContent: intentsRaw.messageContent === "enabled" || intentsRaw.messageContent === "limited" || intentsRaw.messageContent === "disabled" ? intentsRaw.messageContent : void 0 } };
}
function readDiscordPermissionsAuditSummary(value) {
	if (!isRecord(value)) return {};
	const unresolvedChannels = typeof value.unresolvedChannels === "number" && Number.isFinite(value.unresolvedChannels) ? value.unresolvedChannels : void 0;
	const channelsRaw = value.channels;
	return {
		unresolvedChannels,
		channels: Array.isArray(channelsRaw) ? channelsRaw.map((entry) => {
			if (!isRecord(entry)) return null;
			const channelId = asString(entry.channelId);
			if (!channelId) return null;
			const ok = typeof entry.ok === "boolean" ? entry.ok : void 0;
			const missing = Array.isArray(entry.missing) ? entry.missing.map((v) => asString(v)).filter(Boolean) : void 0;
			const error = asString(entry.error) ?? null;
			const matchKey = asString(entry.matchKey) ?? void 0;
			const matchSource = asString(entry.matchSource) ?? void 0;
			return {
				channelId,
				ok,
				missing: missing?.length ? missing : void 0,
				error,
				matchKey,
				matchSource
			};
		}).filter(Boolean) : void 0
	};
}
function collectDiscordStatusIssues(accounts) {
	const issues = [];
	for (const entry of accounts) {
		const account = readDiscordAccountStatus(entry);
		if (!account) continue;
		const accountId = resolveEnabledConfiguredAccountId(account);
		if (!accountId) continue;
		if (readDiscordApplicationSummary(account.application).intents?.messageContent === "disabled") issues.push({
			channel: "discord",
			accountId,
			kind: "intent",
			message: "Message Content Intent is disabled. Bot may not see normal channel messages.",
			fix: "Enable Message Content Intent in Discord Dev Portal → Bot → Privileged Gateway Intents, or require mention-only operation."
		});
		const audit = readDiscordPermissionsAuditSummary(account.audit);
		if (audit.unresolvedChannels && audit.unresolvedChannels > 0) issues.push({
			channel: "discord",
			accountId,
			kind: "config",
			message: `Some configured guild channels are not numeric IDs (unresolvedChannels=${audit.unresolvedChannels}). Permission audit can only check numeric channel IDs.`,
			fix: "Use numeric channel IDs as keys in channels.discord.guilds.*.channels (then rerun channels status --probe)."
		});
		for (const channel of audit.channels ?? []) {
			if (channel.ok === true) continue;
			const missing = channel.missing?.length ? ` missing ${channel.missing.join(", ")}` : "";
			const error = channel.error ? `: ${channel.error}` : "";
			const baseMessage = `Channel ${channel.channelId} permission check failed.${missing}${error}`;
			issues.push({
				channel: "discord",
				accountId,
				kind: "permissions",
				message: appendMatchMetadata(baseMessage, {
					matchKey: channel.matchKey,
					matchSource: channel.matchSource
				}),
				fix: "Ensure the bot role can view + send in this channel (and that channel overrides don't deny it)."
			});
		}
	}
	return issues;
}
//#endregion
export { listDiscordDirectoryPeersFromConfig as a, listDiscordDirectoryGroupsFromConfig as i, resolveDiscordGroupRequireMention as n, resolveDiscordGroupToolPolicy as r, collectDiscordStatusIssues as t };
