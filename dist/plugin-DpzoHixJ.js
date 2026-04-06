import { a as __require, t as __commonJSMin } from "./chunk-iyeSoAlh.js";
//#region node_modules/.pnpm/@microsoft+teams.apps@2.0.6/node_modules/@microsoft/teams.apps/dist/types/plugin/decorators/plugin.js
var require_plugin = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.PLUGIN_METADATA_KEY = void 0;
	exports.Plugin = Plugin;
	__require("reflect-metadata");
	exports.PLUGIN_METADATA_KEY = "teams:plugin";
	/**
	* turn any class into a plugin via
	* `@Plugin({ ... })`
	*/
	function Plugin(metadata = {}) {
		return (Base) => {
			const name = metadata.name || Base.name;
			const version = metadata.version || "0.0.0";
			Reflect.defineMetadata(exports.PLUGIN_METADATA_KEY, {
				name,
				version,
				description: metadata.description
			}, Base);
			return Base;
		};
	}
}));
//#endregion
export { require_plugin as t };
