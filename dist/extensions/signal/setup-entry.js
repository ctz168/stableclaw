import { a as defineSetupPluginEntry } from "../../core-CKHoDVyA.js";
import { s as signalSetupAdapter } from "../../setup-core-C1ze2-yB.js";
import { i as signalSetupWizard, t as createSignalPluginBase } from "../../shared-DmJoFPVx.js";
//#region extensions/signal/src/channel.setup.ts
const signalSetupPlugin = { ...createSignalPluginBase({
	setupWizard: signalSetupWizard,
	setup: signalSetupAdapter
}) };
//#endregion
//#region extensions/signal/setup-entry.ts
var setup_entry_default = defineSetupPluginEntry(signalSetupPlugin);
//#endregion
export { setup_entry_default as default, signalSetupPlugin };
