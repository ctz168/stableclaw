import { a as loadBundledPluginPublicSurfaceModuleSync } from "../facade-runtime-CUPGVj68.js";
//#region src/plugin-sdk/amazon-bedrock.ts
function loadFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "amazon-bedrock",
		artifactBasename: "api.js"
	});
}
const discoverBedrockModels = ((...args) => loadFacadeModule()["discoverBedrockModels"](...args));
const mergeImplicitBedrockProvider = ((...args) => loadFacadeModule()["mergeImplicitBedrockProvider"](...args));
const resetBedrockDiscoveryCacheForTest = ((...args) => loadFacadeModule()["resetBedrockDiscoveryCacheForTest"](...args));
const resolveBedrockConfigApiKey = ((...args) => loadFacadeModule()["resolveBedrockConfigApiKey"](...args));
const resolveImplicitBedrockProvider = ((...args) => loadFacadeModule()["resolveImplicitBedrockProvider"](...args));
//#endregion
export { discoverBedrockModels, mergeImplicitBedrockProvider, resetBedrockDiscoveryCacheForTest, resolveBedrockConfigApiKey, resolveImplicitBedrockProvider };
