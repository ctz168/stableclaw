import { i as defineChannelPluginEntry } from "../../core-CKHoDVyA.js";
import { n as setGoogleChatRuntime } from "../../runtime-CQnm__yj.js";
import { t as googlechatPlugin } from "../../channel-tip7YBMk.js";
//#region extensions/googlechat/index.ts
var googlechat_default = defineChannelPluginEntry({
	id: "googlechat",
	name: "Google Chat",
	description: "OpenClaw Google Chat channel plugin",
	plugin: googlechatPlugin,
	setRuntime: setGoogleChatRuntime
});
//#endregion
export { googlechat_default as default, googlechatPlugin, setGoogleChatRuntime };
