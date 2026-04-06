import { t as getChatChannelMeta } from "../../chat-meta-wVbKo1sw.js";
import { a as splitChannelApprovalCapability } from "../../approval-runtime-DY4QQiAW.js";
import { n as buildDmGroupAccountAllowlistAdapter } from "../../allowlist-config-edit-BWuCplX_.js";
import "../../telegram-core-DHbLiHm7.js";
import { s as resolveTelegramAccount } from "../../accounts-BBGvfk1i.js";
import { t as telegramApprovalCapability } from "../../approval-native-Bsq106sH.js";
import { i as telegramConfigAdapter } from "../../shared-YgPOalLy.js";
//#region extensions/telegram/test-support.ts
const telegramNativeApprovalAdapter = splitChannelApprovalCapability(telegramApprovalCapability);
const telegramCommandTestPlugin = {
	id: "telegram",
	meta: getChatChannelMeta("telegram"),
	capabilities: {
		chatTypes: [
			"direct",
			"group",
			"channel",
			"thread"
		],
		reactions: true,
		threads: true,
		media: true,
		polls: true,
		nativeCommands: true,
		blockStreaming: true
	},
	config: telegramConfigAdapter,
	auth: telegramNativeApprovalAdapter.auth,
	approvalCapability: telegramApprovalCapability,
	pairing: { idLabel: "telegramUserId" },
	allowlist: buildDmGroupAccountAllowlistAdapter({
		channelId: "telegram",
		resolveAccount: resolveTelegramAccount,
		normalize: ({ cfg, accountId, values }) => telegramConfigAdapter.formatAllowFrom({
			cfg,
			accountId,
			allowFrom: values
		}),
		resolveDmAllowFrom: (account) => account.config.allowFrom,
		resolveGroupAllowFrom: (account) => account.config.groupAllowFrom,
		resolveDmPolicy: (account) => account.config.dmPolicy,
		resolveGroupPolicy: (account) => account.config.groupPolicy
	})
};
//#endregion
export { telegramCommandTestPlugin };
