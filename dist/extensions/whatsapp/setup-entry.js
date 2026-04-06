import { a as defineSetupPluginEntry } from "../../core-CKHoDVyA.js";
import { n as resolveWhatsAppGroupIntroHint } from "../../whatsapp-shared-CVenM65w.js";
import { n as resolveWhatsAppGroupToolPolicy, t as resolveWhatsAppGroupRequireMention } from "../../group-policy-DuvnZLji.js";
import { t as whatsappSetupAdapter } from "../../setup-core-syop9qpy.js";
import { i as whatsappSetupWizardProxy, n as createWhatsAppPluginBase } from "../../shared-Ddl2-fk7.js";
import "../../api-CcJrd5ub.js";
import { d as webAuthExists } from "../../auth-store-VAzxHroF.js";
//#region extensions/whatsapp/src/channel.setup.ts
const whatsappSetupPlugin = { ...createWhatsAppPluginBase({
	groups: {
		resolveRequireMention: resolveWhatsAppGroupRequireMention,
		resolveToolPolicy: resolveWhatsAppGroupToolPolicy,
		resolveGroupIntroHint: resolveWhatsAppGroupIntroHint
	},
	setupWizard: whatsappSetupWizardProxy,
	setup: whatsappSetupAdapter,
	isConfigured: async (account) => await webAuthExists(account.authDir)
}) };
//#endregion
//#region extensions/whatsapp/setup-entry.ts
var setup_entry_default = defineSetupPluginEntry(whatsappSetupPlugin);
//#endregion
export { setup_entry_default as default, whatsappSetupPlugin };
