import { t as getChatChannelMeta } from "./chat-meta-wVbKo1sw.js";
import { n as describeAccountSnapshot } from "./account-helpers-jJOgsae3.js";
import { c as createScopedChannelConfigAdapter, m as formatTrimmedAllowFromEntries, t as adaptScopedAccountAccessor } from "./channel-config-helpers-CLFL8FLU.js";
import { n as createChannelPluginBase } from "./core-CKHoDVyA.js";
import { t as createRestrictSendersChannelSecurity } from "./channel-policy-DmKXVkPA.js";
import "./runtime-api-CVUpfFxD.js";
import { b as resolveIMessageAccount, v as listIMessageAccountIds, y as resolveDefaultIMessageAccountId } from "./monitor-provider-Byl4E-2K.js";
import { n as createIMessageSetupWizardProxy } from "./setup-core-DhramRhe.js";
import { t as IMessageChannelConfigSchema } from "./config-schema-DW-r7jJt.js";
//#region extensions/imessage/src/shared.ts
const IMESSAGE_CHANNEL = "imessage";
async function loadIMessageChannelRuntime() {
	return await import("./channel.runtime-Cs4Afgi2.js");
}
const imessageSetupWizard = createIMessageSetupWizardProxy(async () => (await loadIMessageChannelRuntime()).imessageSetupWizard);
const imessageConfigAdapter = createScopedChannelConfigAdapter({
	sectionKey: IMESSAGE_CHANNEL,
	listAccountIds: listIMessageAccountIds,
	resolveAccount: adaptScopedAccountAccessor(resolveIMessageAccount),
	defaultAccountId: resolveDefaultIMessageAccountId,
	clearBaseFields: [
		"cliPath",
		"dbPath",
		"service",
		"region",
		"name"
	],
	resolveAllowFrom: (account) => account.config.allowFrom,
	formatAllowFrom: (allowFrom) => formatTrimmedAllowFromEntries(allowFrom),
	resolveDefaultTo: (account) => account.config.defaultTo
});
const imessageSecurityAdapter = createRestrictSendersChannelSecurity({
	channelKey: IMESSAGE_CHANNEL,
	resolveDmPolicy: (account) => account.config.dmPolicy,
	resolveDmAllowFrom: (account) => account.config.allowFrom,
	resolveGroupPolicy: (account) => account.config.groupPolicy,
	surface: "iMessage groups",
	openScope: "any member",
	groupPolicyPath: "channels.imessage.groupPolicy",
	groupAllowFromPath: "channels.imessage.groupAllowFrom",
	mentionGated: false,
	policyPathSuffix: "dmPolicy"
});
function createIMessagePluginBase(params) {
	return createChannelPluginBase({
		id: IMESSAGE_CHANNEL,
		meta: {
			...getChatChannelMeta(IMESSAGE_CHANNEL),
			aliases: ["imsg"],
			showConfigured: false
		},
		setupWizard: params.setupWizard,
		capabilities: {
			chatTypes: ["direct", "group"],
			media: true
		},
		reload: { configPrefixes: ["channels.imessage"] },
		configSchema: IMessageChannelConfigSchema,
		config: {
			...imessageConfigAdapter,
			isConfigured: (account) => account.configured,
			describeAccount: (account) => describeAccountSnapshot({
				account,
				configured: account.configured
			})
		},
		security: imessageSecurityAdapter,
		setup: params.setup
	});
}
//#endregion
export { imessageSecurityAdapter as n, imessageSetupWizard as r, createIMessagePluginBase as t };
