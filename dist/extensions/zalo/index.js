import { i as defineChannelPluginEntry } from "../../core-CKHoDVyA.js";
import { t as zaloPlugin } from "../../channel-ChCjsShR.js";
import { n as setZaloRuntime } from "../../runtime-CWj1_KrV.js";
//#region extensions/zalo/index.ts
var zalo_default = defineChannelPluginEntry({
	id: "zalo",
	name: "Zalo",
	description: "Zalo channel plugin",
	plugin: zaloPlugin,
	setRuntime: setZaloRuntime
});
//#endregion
export { zalo_default as default, setZaloRuntime, zaloPlugin };
