import { a as loadBundledPluginPublicSurfaceModuleSync } from "./facade-runtime-CUPGVj68.js";
//#region src/plugin-sdk/slack-account.ts
function loadFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "slack",
		artifactBasename: "api.js"
	});
}
const resolveSlackAccount = ((...args) => loadFacadeModule()["resolveSlackAccount"](...args));
//#endregion
export { resolveSlackAccount as t };
