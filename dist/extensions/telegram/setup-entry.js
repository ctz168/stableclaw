import { a as defineSetupPluginEntry } from "../../core-CKHoDVyA.js";
import { n as telegramSetupAdapter, t as telegramSetupWizard } from "../../setup-surface-DNHKuUD5.js";
import { t as createTelegramPluginBase } from "../../shared-YgPOalLy.js";
//#region extensions/telegram/src/channel.setup.ts
const telegramSetupPlugin = { ...createTelegramPluginBase({
	setupWizard: telegramSetupWizard,
	setup: telegramSetupAdapter
}) };
//#endregion
//#region extensions/telegram/setup-entry.ts
var setup_entry_default = defineSetupPluginEntry(telegramSetupPlugin);
//#endregion
export { setup_entry_default as default, telegramSetupPlugin };
