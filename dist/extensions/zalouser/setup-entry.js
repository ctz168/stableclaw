import { a as defineSetupPluginEntry } from "../../core-CKHoDVyA.js";
import { n as zalouserSetupAdapter, t as zalouserSetupWizard } from "../../setup-surface-CTJkIr86.js";
import { t as createZalouserPluginBase } from "../../shared-BcL6d_vz.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
//#region extensions/zalouser/setup-entry.ts
var setup_entry_default = defineSetupPluginEntry(zalouserSetupPlugin);
//#endregion
export { setup_entry_default as default, zalouserSetupPlugin };
