import { a as defineSetupPluginEntry } from "../../core-CKHoDVyA.js";
import { i as createSlackPluginBase, n as slackSetupAdapter, t as slackSetupWizard } from "../../setup-surface-DCe9gFEs.js";
//#region extensions/slack/src/channel.setup.ts
const slackSetupPlugin = { ...createSlackPluginBase({
	setupWizard: slackSetupWizard,
	setup: slackSetupAdapter
}) };
//#endregion
//#region extensions/slack/setup-entry.ts
var setup_entry_default = defineSetupPluginEntry(slackSetupPlugin);
//#endregion
export { setup_entry_default as default, slackSetupPlugin };
