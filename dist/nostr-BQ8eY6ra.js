import "./zod-schema.core-C1Ewlj9j.js";
import "./config-schema-mfJ91WLf.js";
import "./status-helpers-CCJSSrVJ.js";
import "./ssrf-DbpV0Zd3.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-BnePySDW.js";
import "./channel-reply-pipeline-CkNQohFS.js";
import "./direct-dm-CvzgD86I.js";
import "./webhook-memory-guards-DMEy6UZk.js";
//#region src/plugin-sdk/nostr.ts
const nostrSetup = createOptionalChannelSetupSurface({
	channel: "nostr",
	label: "Nostr",
	npmSpec: "@stableclaw/nostr",
	docsPath: "/channels/nostr"
});
const nostrSetupAdapter = nostrSetup.setupAdapter;
const nostrSetupWizard = nostrSetup.setupWizard;
//#endregion
export { nostrSetupWizard as n, nostrSetupAdapter as t };
