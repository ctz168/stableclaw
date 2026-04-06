import { i as defineChannelPluginEntry } from "../../core-CKHoDVyA.js";
import { n as setWhatsAppRuntime, t as whatsappPlugin } from "../../channel-BLNzUIgS.js";
//#region extensions/whatsapp/index.ts
var whatsapp_default = defineChannelPluginEntry({
	id: "whatsapp",
	name: "WhatsApp",
	description: "WhatsApp channel plugin",
	plugin: whatsappPlugin,
	setRuntime: setWhatsAppRuntime
});
//#endregion
export { whatsapp_default as default, setWhatsAppRuntime, whatsappPlugin };
