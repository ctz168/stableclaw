import { i as defineChannelPluginEntry } from "../../core-CKHoDVyA.js";
import { t as bluebubblesPlugin } from "../../channel-DFnErjrk.js";
import { n as setBlueBubblesRuntime } from "../../runtime-DvenAQ8v.js";
//#region extensions/bluebubbles/index.ts
var bluebubbles_default = defineChannelPluginEntry({
	id: "bluebubbles",
	name: "BlueBubbles",
	description: "BlueBubbles channel plugin (macOS app)",
	plugin: bluebubblesPlugin,
	setRuntime: setBlueBubblesRuntime
});
//#endregion
export { bluebubblesPlugin, bluebubbles_default as default, setBlueBubblesRuntime };
