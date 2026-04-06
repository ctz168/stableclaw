import "./utils-CN_F_3Qg.js";
import "./links-D7o22Ygt.js";
import "./zod-schema.providers-core-Bmbs-R4l.js";
import "./config-schema-mfJ91WLf.js";
import "./file-lock-CH0V9dhL.js";
import "./json-store-FUgu1pyj.js";
import "./status-helpers-CCJSSrVJ.js";
import "./tokens-C2f9Klbt.js";
import "./mime-DkaKoCVP.js";
import "./ssrf-DbpV0Zd3.js";
import "./fetch-guard-DCj2_spg.js";
import "./store-BOF6oB0g.js";
import "./setup-wizard-helpers-4lMI_ec6.js";
import "./dm-policy-shared-CmJaeeLZ.js";
import "./history-Bui58gPJ.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-BnePySDW.js";
import "./channel-reply-pipeline-CkNQohFS.js";
import "./ssrf-policy-B3TDgBc5.js";
import "./inbound-reply-dispatch-ZC8jkavy.js";
import "./web-media-B1nHStP6.js";
import "./outbound-media-CE8fphwh.js";
import "./session-envelope--awz9mhw.js";
//#region src/plugin-sdk/msteams.ts
const msteamsSetup = createOptionalChannelSetupSurface({
	channel: "msteams",
	label: "Microsoft Teams",
	npmSpec: "@stableclaw/msteams",
	docsPath: "/channels/msteams"
});
const msteamsSetupWizard = msteamsSetup.setupWizard;
const msteamsSetupAdapter = msteamsSetup.setupAdapter;
//#endregion
export { msteamsSetupWizard as n, msteamsSetupAdapter as t };
