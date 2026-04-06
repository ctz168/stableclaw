import "./links-D7o22Ygt.js";
import "./zod-schema.providers-core-Bmbs-R4l.js";
import "./config-schema-mfJ91WLf.js";
import "./registry-mVzzlPf7.js";
import "./setup-helpers-0yWIq2cW.js";
import "./status-helpers-CCJSSrVJ.js";
import "./common-Dbmo0I1E.js";
import "./fetch-guard-DCj2_spg.js";
import "./fetch-DD0-6ZFw.js";
import { n as resolveChannelGroupRequireMention } from "./group-policy-G9GcSyph.js";
import "./setup-wizard-helpers-4lMI_ec6.js";
import "./dm-policy-shared-CmJaeeLZ.js";
import "./channel-policy-DmKXVkPA.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-BnePySDW.js";
import "./channel-reply-pipeline-CkNQohFS.js";
import "./web-media-B1nHStP6.js";
import "./outbound-media-CE8fphwh.js";
import "./webhook-ingress-Oa6-YF4Q.js";
//#region src/plugin-sdk/googlechat.ts
function resolveGoogleChatGroupRequireMention(params) {
	return resolveChannelGroupRequireMention({
		cfg: params.cfg,
		channel: "googlechat",
		groupId: params.groupId,
		accountId: params.accountId
	});
}
const googlechatSetup = createOptionalChannelSetupSurface({
	channel: "googlechat",
	label: "Google Chat",
	npmSpec: "@stableclaw/googlechat",
	docsPath: "/channels/googlechat"
});
const googlechatSetupAdapter = googlechatSetup.setupAdapter;
const googlechatSetupWizard = googlechatSetup.setupWizard;
//#endregion
export { googlechatSetupWizard as n, resolveGoogleChatGroupRequireMention as r, googlechatSetupAdapter as t };
