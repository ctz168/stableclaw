import "./links-D7o22Ygt.js";
import "./config-schema-mfJ91WLf.js";
import "./setup-helpers-0yWIq2cW.js";
import "./status-helpers-CCJSSrVJ.js";
import "./ssrf-DbpV0Zd3.js";
import "./fetch-guard-DCj2_spg.js";
import "./runtime-C5__utHi.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-BnePySDW.js";
import "./channel-reply-pipeline-CkNQohFS.js";
//#region src/plugin-sdk/tlon.ts
const tlonSetup = createOptionalChannelSetupSurface({
	channel: "tlon",
	label: "Tlon",
	npmSpec: "@stableclaw/tlon",
	docsPath: "/channels/tlon"
});
const tlonSetupAdapter = tlonSetup.setupAdapter;
const tlonSetupWizard = tlonSetup.setupWizard;
//#endregion
export { tlonSetupWizard as n, tlonSetupAdapter as t };
