import { a as loadBundledPluginPublicSurfaceModuleSync } from "./facade-runtime-CUPGVj68.js";
//#region src/plugin-sdk/slack-target-parser.ts
function loadFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "slack",
		artifactBasename: "api.js"
	});
}
const parseSlackTarget = ((...args) => loadFacadeModule()["parseSlackTarget"](...args));
const resolveSlackChannelId = ((...args) => loadFacadeModule()["resolveSlackChannelId"](...args));
//#endregion
export { resolveSlackChannelId as n, parseSlackTarget as t };
