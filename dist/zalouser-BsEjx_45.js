import "./tmp-openclaw-dir-B44_vmJv.js";
import "./zod-schema.core-C1Ewlj9j.js";
import "./config-schema-mfJ91WLf.js";
import "./zod-schema.agent-runtime-DFC7a3eV.js";
import "./setup-helpers-0yWIq2cW.js";
import "./status-helpers-CCJSSrVJ.js";
import "./setup-wizard-helpers-4lMI_ec6.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-BnePySDW.js";
import "./channel-reply-pipeline-CkNQohFS.js";
import "./outbound-media-CE8fphwh.js";
import "./command-auth-CPrwYEfb.js";
//#region src/plugin-sdk/zalouser.ts
const zalouserSetup = createOptionalChannelSetupSurface({
	channel: "zalouser",
	label: "Zalo Personal",
	npmSpec: "@stableclaw/zalouser",
	docsPath: "/channels/zalouser"
});
const zalouserSetupAdapter = zalouserSetup.setupAdapter;
const zalouserSetupWizard = zalouserSetup.setupWizard;
//#endregion
export { zalouserSetupWizard as n, zalouserSetupAdapter as t };
