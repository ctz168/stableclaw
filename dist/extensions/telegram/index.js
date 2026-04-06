import { i as defineChannelPluginEntry } from "../../core-CKHoDVyA.js";
import { n as setTelegramRuntime, t as telegramPlugin } from "../../channel-CrH-WDcm.js";
//#region extensions/telegram/index.ts
var telegram_default = defineChannelPluginEntry({
	id: "telegram",
	name: "Telegram",
	description: "Telegram channel plugin",
	plugin: telegramPlugin,
	setRuntime: setTelegramRuntime
});
//#endregion
export { telegram_default as default, setTelegramRuntime, telegramPlugin };
