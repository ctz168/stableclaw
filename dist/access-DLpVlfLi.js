import { i as resolveOpenProviderRuntimeGroupPolicy } from "./runtime-group-policy-zTp8fKRK.js";
import { t as resolveCommandAuthorizedFromAuthorizers } from "./command-gating-NyDk7t84.js";
import "./command-auth-native-DkC5bq6M.js";
import { f as resolveDiscordOwnerAccess, l as resolveDiscordGuildEntry, n as isDiscordGroupAllowedByPolicy, s as resolveDiscordChannelConfigWithFallback, u as resolveDiscordMemberAccessState } from "./allow-list-BNjwdUSD.js";
//#region extensions/discord/src/voice/access.ts
async function authorizeDiscordVoiceIngress(params) {
	const groupPolicy = params.groupPolicy ?? resolveOpenProviderRuntimeGroupPolicy({
		providerConfigPresent: params.cfg.channels?.discord !== void 0,
		groupPolicy: params.discordConfig.groupPolicy,
		defaultGroupPolicy: params.cfg.channels?.defaults?.groupPolicy
	}).groupPolicy;
	const guildInfo = resolveDiscordGuildEntry({
		guild: params.guild ?? {
			id: params.guildId,
			...params.guildName ? { name: params.guildName } : {}
		},
		guildId: params.guildId,
		guildEntries: params.discordConfig.guilds
	});
	const channelConfig = params.channelId ? resolveDiscordChannelConfigWithFallback({
		guildInfo,
		channelId: params.channelId,
		channelName: params.channelName,
		channelSlug: params.channelSlug,
		parentId: params.parentId,
		parentName: params.parentName,
		parentSlug: params.parentSlug,
		scope: params.scope
	}) : null;
	if (channelConfig?.enabled === false) return {
		ok: false,
		message: "This channel is disabled."
	};
	const channelAllowlistConfigured = Boolean(guildInfo?.channels) && Object.keys(guildInfo?.channels ?? {}).length > 0;
	if (!params.channelId && groupPolicy === "allowlist" && channelAllowlistConfigured) return {
		ok: false,
		message: `${params.channelLabel ?? "This channel"} is not allowlisted for voice commands.`
	};
	const channelAllowed = channelConfig ? channelConfig.allowed !== false : !channelAllowlistConfigured;
	if (!isDiscordGroupAllowedByPolicy({
		groupPolicy,
		guildAllowlisted: Boolean(guildInfo),
		channelAllowlistConfigured,
		channelAllowed
	}) || channelConfig?.allowed === false) return {
		ok: false,
		message: `${params.channelLabel ?? "This channel"} is not allowlisted for voice commands.`
	};
	const { hasAccessRestrictions, memberAllowed } = resolveDiscordMemberAccessState({
		channelConfig,
		guildInfo,
		memberRoleIds: params.memberRoleIds,
		sender: params.sender,
		allowNameMatching: false
	});
	const { ownerAllowList, ownerAllowed } = resolveDiscordOwnerAccess({
		allowFrom: params.discordConfig.allowFrom ?? params.discordConfig.dm?.allowFrom ?? [],
		sender: params.sender,
		allowNameMatching: false
	});
	const useAccessGroups = params.useAccessGroups ?? params.cfg.commands?.useAccessGroups !== false;
	return resolveCommandAuthorizedFromAuthorizers({
		useAccessGroups,
		authorizers: useAccessGroups ? [{
			configured: ownerAllowList != null,
			allowed: ownerAllowed
		}, {
			configured: hasAccessRestrictions,
			allowed: memberAllowed
		}] : [{
			configured: hasAccessRestrictions,
			allowed: memberAllowed
		}],
		modeWhenAccessGroupsOff: "configured"
	}) ? { ok: true } : {
		ok: false,
		message: "You are not authorized to use this command."
	};
}
//#endregion
export { authorizeDiscordVoiceIngress as t };
