import { a as loadBundledPluginPublicSurfaceModuleSync } from "./facade-runtime-CUPGVj68.js";
//#region src/plugin-sdk/matrix-thread-bindings.ts
function loadFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "matrix",
		artifactBasename: "api.js"
	});
}
const setMatrixThreadBindingIdleTimeoutBySessionKey = ((...args) => loadFacadeModule()["setMatrixThreadBindingIdleTimeoutBySessionKey"](...args));
const setMatrixThreadBindingMaxAgeBySessionKey = ((...args) => loadFacadeModule()["setMatrixThreadBindingMaxAgeBySessionKey"](...args));
//#endregion
export { setMatrixThreadBindingMaxAgeBySessionKey as n, setMatrixThreadBindingIdleTimeoutBySessionKey as t };
