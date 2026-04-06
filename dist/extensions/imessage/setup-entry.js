import { a as defineSetupPluginEntry } from "../../core-CKHoDVyA.js";
import { a as imessageSetupAdapter } from "../../setup-core-DhramRhe.js";
import { r as imessageSetupWizard, t as createIMessagePluginBase } from "../../shared-BaNnNFZU.js";
//#region extensions/imessage/src/channel.setup.ts
const imessageSetupPlugin = { ...createIMessagePluginBase({
	setupWizard: imessageSetupWizard,
	setup: imessageSetupAdapter
}) };
//#endregion
//#region extensions/imessage/setup-entry.ts
var setup_entry_default = defineSetupPluginEntry(imessageSetupPlugin);
//#endregion
export { setup_entry_default as default, imessageSetupPlugin };
